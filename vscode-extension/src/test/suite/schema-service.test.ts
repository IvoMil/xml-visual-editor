import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as vscode from 'vscode';
import { SchemaService } from '../../services/schema-service';

const fakeStorageUri = vscode.Uri.file(path.resolve(__dirname, '.test-storage'));

suite('SchemaService - detection', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xve-test-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('detects xsi:noNamespaceSchemaLocation and resolves relative path', async () => {
    const docsDir = path.join(tmpDir, 'docs');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(
      path.join(docsDir, 'schema.xsd'),
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
    );

    const sentRequests: any[] = [];
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string, params: any) => {
        sentRequests.push({ method, params });
        return Promise.resolve({ success: true });
      },
    } as any;

    const svc = new SchemaService(engineMock, fakeStorageUri);

    const docPath = path.join(docsDir, 'file.xml');
    const xml =
      '<?xml version="1.0"?>\n<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="schema.xsd">';

    const doc = {
      languageId: 'xml',
      lineCount: 5,
      uri: { fsPath: docPath, toString: () => `file://${docPath}` },
      getText: (_range?: any) => xml,
    } as any;

    await svc.loadSchemaForDocument(doc);

    const id = svc.getSchemaIdForDocument(doc.uri.toString());
    assert.ok(id?.startsWith('schema_'));

    const sent = sentRequests[0];
    assert.strictEqual(sent.method, 'schema.load');
    const expectedPath = path.resolve(path.dirname(docPath), 'schema.xsd');
    assert.strictEqual(sent.params.file_path, expectedPath);
  });

  test('detects xsi:schemaLocation pairs and uses second token', async () => {
    const examplesDir = path.join(tmpDir, 'examples');
    fs.mkdirSync(examplesDir, { recursive: true });
    fs.writeFileSync(
      path.join(examplesDir, 'schema1.xsd'),
      '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>',
    );

    const sentRequests: any[] = [];
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string, params: any) => {
        sentRequests.push({ method, params });
        return Promise.resolve({ success: true });
      },
    } as any;

    const svc = new SchemaService(engineMock, fakeStorageUri);

    const docPath = path.join(examplesDir, 'f.xml');
    const xml =
      '<?xml version="1.0"?>\n<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://example.com/schema schema1.xsd">';

    const doc = {
      languageId: 'xml',
      lineCount: 5,
      uri: { fsPath: docPath, toString: () => `file://${docPath}` },
      getText: (_range?: any) => xml,
    } as any;

    await svc.loadSchemaForDocument(doc);
    const id = svc.getSchemaIdForDocument(doc.uri.toString());
    assert.ok(id?.startsWith('schema_'));

    const sent = sentRequests[0];
    const expectedPath = path.resolve(path.dirname(docPath), 'schema1.xsd');
    assert.strictEqual(sent.params.file_path, expectedPath);
  });

  test('absolute schema path is returned as-is', async () => {
    const schemaPath = path.join(tmpDir, 'schema.xsd');
    fs.writeFileSync(schemaPath, '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>');

    const sentRequests: any[] = [];
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string, params: any) => {
        sentRequests.push({ method, params });
        return Promise.resolve({ success: true });
      },
    } as any;

    const svc = new SchemaService(engineMock, fakeStorageUri);
    const xml = `<?xml version="1.0"?>\n<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="${schemaPath}">`;

    const doc = {
      languageId: 'xml',
      lineCount: 5,
      uri: { fsPath: path.join(tmpDir, 'file.xml'), toString: () => 'uri' },
      getText: (_range?: any) => xml,
    } as any;

    await svc.loadSchemaForDocument(doc);
    const sent = sentRequests[0];
    assert.strictEqual(sent.params.file_path, schemaPath);
  });

  test('missing schema reference does not load', async () => {
    const engineMock = {
      isReady: () => true,
      sendRequest: () => Promise.reject(new Error('should not be called')),
    } as any;
    const svc = new SchemaService(engineMock, fakeStorageUri);
    const xml = '<?xml version="1.0"?><root/>';
    const doc = {
      languageId: 'xml',
      lineCount: 1,
      uri: { fsPath: 'a', toString: () => 'a' },
      getText: () => xml,
    } as any;
    await svc.loadSchemaForDocument(doc);
    const id = svc.getSchemaIdForDocument(doc.uri.toString());
    assert.strictEqual(id, undefined);
  });
});
