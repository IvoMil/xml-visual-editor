import * as assert from 'assert';
import * as vscode from 'vscode';
import { ValidationService } from '../../services/validation-service';
import { ValidationResult } from '../../engine/types';

function mockEngineClient(opts: { ready?: boolean; result?: ValidationResult } = {}): any {
  const defaultResult: ValidationResult = { valid: true, diagnostics: [] };
  const recorded: any = {
    calls: [],
    isReady: () => opts.ready ?? true,
    sendRequest: (method: string, params?: unknown) => {
      recorded.calls.push({ method, params });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return Promise.resolve(opts.result ?? defaultResult);
    },
  };
  return recorded;
}

function mockDocument(opts: { languageId?: string; text?: string; uri?: string } = {}): any {
  const uri = {
    toString: () => opts.uri ?? 'file:///test.xml',
    fsPath: opts.uri ?? 'C:\\test.xml',
  };
  return {
    languageId: opts.languageId ?? 'xml',
    getText: () => opts.text ?? '<root/>',
    uri,
    getWordRangeAtPosition: () => undefined,
    lineAt: (_line: number) => ({
      text: opts.text ?? '<root/>',
      range: { end: { character: (opts.text ?? '<root/>').length } },
    }),
    lineCount: 1,
  };
}

describe('ValidationService', () => {
  let originalCreateCollection: typeof vscode.languages.createDiagnosticCollection;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

  beforeEach(() => {
    originalCreateCollection = vscode.languages.createDiagnosticCollection;
    originalGetConfiguration = vscode.workspace.getConfiguration;
  });

  afterEach(() => {
    vscode.languages.createDiagnosticCollection = originalCreateCollection;
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  describe('validateFull', () => {
    it('calls validateWithSchema when schema is associated', async () => {
      const engine = mockEngineClient();
      let calledValidateWithSchema = false;
      const getSchemaId = () => 'schema_1';
      const svc = new ValidationService(engine, getSchemaId);

      // spy on validateWithSchema
      const orig = (svc as any).validateWithSchema.bind(svc);
      (svc as any).validateWithSchema = (doc: any, schemaId?: string) => {
        calledValidateWithSchema = true;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return orig(doc, schemaId);
      };

      const doc = mockDocument();
      await svc.validateFull(doc);
      assert.ok(calledValidateWithSchema);
      svc.dispose();
    });

    it('calls validateDocument when no schema is associated', async () => {
      const engine = mockEngineClient();
      let calledValidateDocument = false;
      const getSchemaId = () => undefined;
      const svc = new ValidationService(engine, getSchemaId);

      // spy
      const orig = (svc as any).validateDocument.bind(svc);
      (svc as any).validateDocument = (doc: any) => {
        calledValidateDocument = true;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return orig(doc);
      };

      const doc = mockDocument();
      await svc.validateFull(doc);
      assert.ok(calledValidateDocument);
      svc.dispose();
    });

    it('skips validation for non-XML documents', async () => {
      const engine = mockEngineClient();
      const getSchemaId = () => 'schema_1';
      const svc = new ValidationService(engine, getSchemaId);
      const doc = mockDocument({ languageId: 'plaintext' });

      await svc.validateFull(doc);
      assert.strictEqual(engine.calls.length, 0);
      svc.dispose();
    });

    it('skips validation when engine is not ready', async () => {
      const engine = mockEngineClient({ ready: false });
      const getSchemaId = () => undefined;
      const svc = new ValidationService(engine, getSchemaId);
      const doc = mockDocument();

      await svc.validateFull(doc);
      assert.strictEqual(engine.calls.length, 0);
      svc.dispose();
    });
  });

  describe('validateDocument', () => {
    it('sends validation.validateWellFormedness to engine', async () => {
      const engine = mockEngineClient();
      const svc = new ValidationService(engine, () => undefined);
      const doc = mockDocument({ text: '<root/>' });

      await svc.validateDocument(doc);
      assert.strictEqual(engine.calls.length, 1);
      assert.strictEqual(engine.calls[0].method, 'validation.validateWellFormedness');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      assert.ok(
        engine.calls[0].params && (engine.calls[0].params as Record<string, unknown>).content,
      );
      svc.dispose();
    });

    it('updates diagnostics from engine response', async () => {
      const diag = { line: 1, column: 1, message: 'err', severity: 'error' } as any;
      const engine = mockEngineClient({ result: { valid: false, diagnostics: [diag] } });

      // replace diagnostic collection with a recorder
      let recordedSet: any = null;
      vscode.languages.createDiagnosticCollection = (_name?: string) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        ({
          set: (uri: vscode.Uri, diagnostics: vscode.Diagnostic[]) => {
            recordedSet = { uri, diagnostics };
          },
          delete: () => {},
          dispose: () => {},
        }) as any;

      const svc = new ValidationService(engine, () => undefined);
      const doc = mockDocument();
      await svc.validateDocument(doc);

      assert.ok(recordedSet, 'diagnosticCollection.set was not called');
      assert.strictEqual(recordedSet.diagnostics.length, 1);
      assert.strictEqual(recordedSet.diagnostics[0].message, 'err');
      svc.dispose();
    });
  });

  describe('validateWithSchema', () => {
    it('sends validation.validateSchema with schema_id to engine', async () => {
      const engine = mockEngineClient();
      const svc = new ValidationService(engine, () => undefined);
      const doc = mockDocument();
      await svc.validateWithSchema(doc, 'schema_abc');
      assert.strictEqual(engine.calls.length, 1);
      assert.strictEqual(engine.calls[0].method, 'validation.validateSchema');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      assert.strictEqual(
        (engine.calls[0].params as Record<string, unknown>).schema_id,
        'schema_abc',
      );
      svc.dispose();
    });
  });

  describe('scheduleValidation', () => {
    it('debounces multiple calls for same document', async () => {
      // make config return validateOnType=true and small delay
      vscode.workspace.getConfiguration = (_section?: string) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        ({
          get: (key: string, _defaultVal?: any) => {
            if (key === 'validateOnType') return true;
            if (key === 'validationDelay') return 20;
            return undefined;
          },
        }) as any;

      const engine = mockEngineClient();
      const svc = new ValidationService(engine, () => undefined);
      const doc = mockDocument();

      svc.scheduleValidation(doc);
      svc.scheduleValidation(doc);

      await new Promise((r) => setTimeout(r, 60));
      // should have invoked validation once
      assert.strictEqual(engine.calls.length, 1);
      svc.dispose();
    });
  });

  describe('clearDiagnostics', () => {
    it('clears diagnostics for given URI', () => {
      let deleted: vscode.Uri | null = null;
      vscode.languages.createDiagnosticCollection = (_name?: string) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        ({
          set: () => {},
          delete: (uri: vscode.Uri) => {
            deleted = uri;
          },
          dispose: () => {},
        }) as any;

      const svc = new ValidationService(mockEngineClient(), () => undefined);
      const uri = { toString: () => 'file:///x', fsPath: 'C:\\x' } as any as vscode.Uri;
      svc.clearDiagnostics(uri);
      assert.ok(deleted !== null);
      svc.dispose();
    });
  });

  describe('dispose', () => {
    it('clears all pending timers', (done) => {
      vscode.workspace.getConfiguration = (_section?: string) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        ({
          get: (key: string, _defaultVal?: any) => {
            if (key === 'validateOnType') return true;
            if (key === 'validationDelay') return 200;
            return undefined;
          },
        }) as any;

      const engine = mockEngineClient();
      const svc = new ValidationService(engine, () => undefined);
      const doc = mockDocument();
      svc.scheduleValidation(doc);
      // dispose immediately; timer should be cleared
      svc.dispose();

      setTimeout(() => {
        assert.strictEqual(engine.calls.length, 0);
        done();
      }, 300);
    });
  });
});
