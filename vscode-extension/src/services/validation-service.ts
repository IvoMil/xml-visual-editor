import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { Diagnostic as EngineDiagnostic, ValidationResult } from '../engine/types';

export class ValidationService implements vscode.Disposable {
  private readonly diagnosticCollection: vscode.DiagnosticCollection;
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly engineClient: EngineClient,
    private readonly getSchemaIdFn: (docUri: string) => string | undefined,
  ) {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('xml-visual-editor');
    this.disposables.push(this.diagnosticCollection);
  }

  /** Validate well-formedness only. */
  async validateDocument(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'xml') {
      return;
    }
    if (!this.engineClient.isReady()) {
      void vscode.window.showWarningMessage(
        'XML engine is starting up. Please try again in a moment.',
      );
      return;
    }

    try {
      const content = document.getText();

      // Engine validation methods take content directly
      const result = (await this.engineClient.sendRequest(
        'validation.validateWellFormedness',
        {
          content,
        },
        60000,
      )) as ValidationResult;

      this.updateDiagnostics(document, result.diagnostics);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Validation failed for ${document.uri.fsPath}: ${message}`);
    }
  }

  /** Validate against a specific schema. Schema validation is a superset of well-formedness. */
  async validateWithSchema(document: vscode.TextDocument, schemaId: string): Promise<void> {
    if (document.languageId !== 'xml') {
      return;
    }
    if (!this.engineClient.isReady()) {
      void vscode.window.showWarningMessage(
        'XML engine is starting up. Please try again in a moment.',
      );
      return;
    }

    try {
      const content = document.getText();

      const result = (await this.engineClient.sendRequest(
        'validation.validateSchema',
        {
          content,
          schema_id: schemaId,
        },
        60000,
      )) as ValidationResult;

      this.updateDiagnostics(document, result.diagnostics);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Schema validation failed for ${document.uri.fsPath}: ${message}`);
    }
  }

  /** Full validation: well-formedness + schema (if associated). */
  async validateFull(document: vscode.TextDocument): Promise<void> {
    if (document.languageId !== 'xml') {
      return;
    }
    if (!this.engineClient.isReady()) {
      void vscode.window.showWarningMessage(
        'XML engine is starting up. Please try again in a moment.',
      );
      return;
    }

    // Show "validating" status while in-progress
    const statusMsg = vscode.window.setStatusBarMessage('$(loading~spin) Validating...');
    try {
      const schemaId = this.getSchemaIdFn(document.uri.toString());
      if (schemaId) {
        await this.validateWithSchema(document, schemaId);
      } else {
        await this.validateDocument(document);
      }

      // Show success feedback if no diagnostics remain for this document
      const diags = this.diagnosticCollection.get(document.uri);
      if (!diags || diags.length === 0) {
        void vscode.window.setStatusBarMessage(
          '$(check) Validation passed — no issues found',
          3000,
        );
      }
    } finally {
      statusMsg.dispose();
    }
  }

  /** Schedule debounced validation (respects validateOnType setting). */
  scheduleValidation(document: vscode.TextDocument): void {
    const config = vscode.workspace.getConfiguration('xmlVisualEditor', document.uri);
    if (!config.get<boolean>('validateOnType', true)) {
      return;
    }

    const delay = config.get<number>('validationDelay', 500);
    const key = document.uri.toString();
    const existing = this.debounceTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    this.debounceTimers.set(
      key,
      setTimeout(() => {
        this.debounceTimers.delete(key);
        void this.validateFull(document);
      }, delay),
    );
  }

  clearDiagnostics(uri: vscode.Uri): void {
    this.diagnosticCollection.delete(uri);
  }

  dispose(): void {
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private updateDiagnostics(
    document: vscode.TextDocument,
    engineDiagnostics: EngineDiagnostic[],
  ): void {
    const diagnostics = engineDiagnostics.map((d) => this.mapDiagnostic(d, document));
    this.diagnosticCollection.set(document.uri, diagnostics);

    // Show validation result feedback in status bar
    const count = diagnostics.length;
    if (count === 0) {
      vscode.window.setStatusBarMessage('$(check) No validation errors', 5000);
    } else {
      vscode.window.setStatusBarMessage(
        `$(warning) ${count} validation error${count === 1 ? '' : 's'}`,
        5000,
      );
    }
  }

  private mapDiagnostic(d: EngineDiagnostic, document: vscode.TextDocument): vscode.Diagnostic {
    // Engine uses 1-based lines/columns; VS Code uses 0-based
    const line = Math.max(0, d.line - 1);
    const col = Math.max(0, d.column - 1);
    const pos = new vscode.Position(line, col);

    let range: vscode.Range;

    // Try to get the word range at the error position
    const wordRange = document.getWordRangeAtPosition(pos);
    if (wordRange) {
      range = wordRange;
    } else if (line < document.lineCount) {
      // Fall back to highlighting the full line content (trimmed)
      const lineText = document.lineAt(line).text;
      const firstNonWhitespace = lineText.search(/\S/);
      if (firstNonWhitespace >= 0) {
        range = new vscode.Range(line, firstNonWhitespace, line, lineText.trimEnd().length);
      } else {
        range = new vscode.Range(pos, pos.translate(0, 1));
      }
    } else {
      range = new vscode.Range(pos, pos.translate(0, 1));
    }

    const severity = this.mapSeverity(d.severity);
    const diagnostic = new vscode.Diagnostic(range, d.message, severity);
    diagnostic.source = 'XML Visual Editor';

    if (d.element_path) {
      diagnostic.code = d.element_path;
    }

    return diagnostic;
  }

  private mapSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity.toLowerCase()) {
      case 'error':
        return vscode.DiagnosticSeverity.Error;
      case 'warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'info':
      case 'information':
        return vscode.DiagnosticSeverity.Information;
      case 'hint':
        return vscode.DiagnosticSeverity.Hint;
      default:
        return vscode.DiagnosticSeverity.Error;
    }
  }
}
