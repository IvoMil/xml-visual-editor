import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { EngineClient } from '../engine/engine-client';

const SCHEMA_LOCATION_PATTERN = /xsi:noNamespaceSchemaLocation\s*=\s*["']([^"']+)["']/;
const SCHEMA_LOCATION_NS_PATTERN = /xsi:schemaLocation\s*=\s*["']([^"']+)["']/;
const SCHEMA_IMPORT_PATTERN = /<(?:xs|xsd)?:?(?:include|import)[^>]*schemaLocation="([^"]+)"/g;
const HTTP_URL_PATTERN = /^https?:\/\//i;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export type SchemaLoadResult = 'loaded' | 'no-reference' | 'load-failed';

export class SchemaService implements vscode.Disposable {
  /** Maps document URI → schema_id used by the engine */
  private readonly documentSchemas = new Map<string, string>();
  /** Tracks which schema files have been loaded (by file_path → schema_id) */
  private readonly loadedSchemaFiles = new Map<string, string>();
  private nextSchemaId = 1;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly cacheDir: string;

  constructor(
    private readonly engineClient: EngineClient,
    globalStorageUri: vscode.Uri,
  ) {
    this.cacheDir = path.join(globalStorageUri.fsPath, 'schema-cache');
  }

  async loadSchemaForDocument(document: vscode.TextDocument): Promise<SchemaLoadResult> {
    if (document.languageId !== 'xml' || !this.engineClient.isReady()) {
      return 'no-reference';
    }

    const schemaRef = this.detectSchemaRef(document);
    if (!schemaRef) {
      return 'no-reference';
    }

    try {
      let localPath: string;
      if (HTTP_URL_PATTERN.test(schemaRef)) {
        localPath = await this.resolveHttpSchema(schemaRef);
      } else {
        localPath = schemaRef;
      }

      if (!fs.existsSync(localPath)) {
        console.warn(`[XVE] Schema file not found: ${localPath}`);
        void vscode.window.showWarningMessage(
          `Schema file not found: ${path.basename(localPath)}. Use "Load XSD Schema" command to load manually.`,
        );
        return 'load-failed';
      }
      const schemaId = await this.ensureSchemaLoaded(localPath);
      this.documentSchemas.set(document.uri.toString(), schemaId);
      return 'loaded';
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[XVE] Schema auto-detection failed: ${message}`);
      return 'load-failed';
    }
  }

  async loadSchemaFromFile(filePath: string): Promise<string> {
    if (!this.engineClient.isReady()) {
      throw new Error('Engine is not ready');
    }

    try {
      const schemaId = await this.ensureSchemaLoaded(filePath);
      return schemaId;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Failed to load schema: ${message}`);
      throw err;
    }
  }

  getSchemaIdForDocument(documentUri: string): string | undefined {
    return this.documentSchemas.get(documentUri);
  }

  associateSchemaWithDocument(documentUri: string, schemaId: string): void {
    this.documentSchemas.set(documentUri, schemaId);
  }

  dispose(): void {
    this.documentSchemas.clear();
    this.loadedSchemaFiles.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private async ensureSchemaLoaded(filePath: string): Promise<string> {
    // Check if this file was already loaded
    const existing = this.loadedSchemaFiles.get(filePath);
    if (existing) {
      return existing;
    }

    const schemaId = `schema_${this.nextSchemaId++}`;
    const result = (await this.engineClient.sendRequest(
      'schema.load',
      {
        schema_id: schemaId,
        file_path: filePath,
      },
      60000,
    )) as { success: boolean };

    if (!result.success) {
      throw new Error(`Engine failed to load schema: ${filePath}`);
    }

    this.loadedSchemaFiles.set(filePath, schemaId);
    return schemaId;
  }

  private detectSchemaRef(document: vscode.TextDocument): string | null {
    // Only scan the first 50 lines for schema references
    const maxLines = Math.min(document.lineCount, 50);
    const headerText = document.getText(new vscode.Range(0, 0, maxLines, 0));

    // Try noNamespaceSchemaLocation first
    const noNsMatch = SCHEMA_LOCATION_PATTERN.exec(headerText);
    if (noNsMatch?.[1]) {
      return this.resolveSchemaRef(document, noNsMatch[1]);
    }

    // Try schemaLocation (namespace uri pairs)
    const nsMatch = SCHEMA_LOCATION_NS_PATTERN.exec(headerText);
    if (nsMatch?.[1]) {
      const parts = nsMatch[1].trim().split(/\s+/);
      // schemaLocation is pairs of (namespace, location) — take the second element
      if (parts.length >= 2) {
        return this.resolveSchemaRef(document, parts[1]);
      }
    }

    return null;
  }

  /**
   * Resolve a schema reference to either a local path or an HTTP URL.
   * For HTTP URLs, returns the local file if it exists in the document's directory,
   * otherwise returns the full URL for later download.
   */
  private resolveSchemaRef(document: vscode.TextDocument, schemaRef: string): string | null {
    if (path.isAbsolute(schemaRef)) {
      return schemaRef;
    }

    // Handle HTTP/HTTPS URLs — check local first, otherwise return the URL
    if (HTTP_URL_PATTERN.test(schemaRef)) {
      const urlPath = new URL(schemaRef).pathname;
      const filename = path.basename(urlPath);
      if (filename) {
        const docDir = path.dirname(document.uri.fsPath);
        const localPath = path.join(docDir, filename);
        if (fs.existsSync(localPath)) {
          return localPath;
        }
      }
      return schemaRef; // Return URL for download
    }

    // Resolve relative to the document's directory
    const docDir = path.dirname(document.uri.fsPath);
    return path.resolve(docDir, schemaRef);
  }

  /** Download an HTTP schema and all its imports/includes to the cache directory. */
  private async resolveHttpSchema(url: string): Promise<string> {
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Downloading XSD schema…',
        cancellable: false,
      },
      async (progress) => {
        await fs.promises.mkdir(this.cacheDir, { recursive: true });
        const localPath = this.cachePathForUrl(url);
        progress.report({ message: path.basename(localPath) });
        await this.downloadSchemaRecursive(url, new Set<string>());
        return localPath;
      },
    );
  }

  /** Recursively download a schema and its imports/includes. */
  private async downloadSchemaRecursive(url: string, visited: Set<string>): Promise<void> {
    if (visited.has(url)) {
      return;
    }
    visited.add(url);

    const localPath = this.cachePathForUrl(url);
    let content: string;

    if (fs.existsSync(localPath)) {
      content = await fs.promises.readFile(localPath, 'utf-8');
    } else {
      const buffer = await this.httpGet(url);
      content = buffer.toString('utf-8');
      await fs.promises.writeFile(localPath, content, 'utf-8');
    }

    // Parse for xs:import / xs:include schemaLocation references
    const baseUrl = url.substring(0, url.lastIndexOf('/'));
    let match: RegExpExecArray | null;
    // Reset lastIndex for the global regex
    SCHEMA_IMPORT_PATTERN.lastIndex = 0;
    while ((match = SCHEMA_IMPORT_PATTERN.exec(content)) !== null) {
      const ref = match[1];
      const childUrl = HTTP_URL_PATTERN.test(ref) ? ref : `${baseUrl}/${ref}`;
      await this.downloadSchemaRecursive(childUrl, visited);
    }
  }

  /** Compute a local cache path for a schema URL, avoiding filename collisions. */
  private cachePathForUrl(url: string): string {
    const filename = path.basename(new URL(url).pathname);
    const candidate = path.join(this.cacheDir, filename);
    // Use a hash prefix if the plain filename would collide with a different URL
    const markerPath = `${candidate}.url`;
    if (fs.existsSync(markerPath)) {
      const stored = fs.readFileSync(markerPath, 'utf-8').trim();
      if (stored === url) {
        return candidate;
      }
      // Collision — use hash-prefixed name
      const hash = crypto.createHash('sha256').update(url).digest('hex').substring(0, 8);
      return path.join(this.cacheDir, `${hash}_${filename}`);
    }
    // First time: claim this filename
    if (!fs.existsSync(candidate)) {
      try {
        fs.mkdirSync(this.cacheDir, { recursive: true });
        fs.writeFileSync(markerPath, url, 'utf-8');
      } catch {
        // Best effort — proceed without marker
      }
    }
    return candidate;
  }

  /** Perform an HTTP(S) GET request using Node.js built-in modules. */
  private httpGet(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const get = url.startsWith('https') ? https.get : http.get;
      const req = get(
        url,
        {
          timeout: DOWNLOAD_TIMEOUT_MS,
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'User-Agent': 'XMLVisualEditor/1.0',
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Accept: 'text/xml,application/xml,application/xsd+xml,*/*',
          },
        },
        (res) => {
          // Follow redirects (3xx)
          if (
            res.statusCode &&
            res.statusCode >= 300 &&
            res.statusCode < 400 &&
            res.headers.location
          ) {
            this.httpGet(res.headers.location).then(resolve, reject);
            return;
          }
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Download timed out: ${url}`));
      });
      req.on('error', (err) => {
        reject(new Error(`Failed to download ${url}: ${err.message}`));
      });
    });
  }
}
