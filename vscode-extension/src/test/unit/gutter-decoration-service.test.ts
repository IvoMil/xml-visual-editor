import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { GutterDecorationService } from '../../services/gutter-decoration-service';

describe('GutterDecorationService', () => {
  let originalCreateDecorationType: typeof vscode.window.createTextEditorDecorationType;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;
  let originalGetDiagnostics: any;

  beforeEach(() => {
    originalCreateDecorationType = vscode.window.createTextEditorDecorationType;
    originalGetConfiguration = vscode.workspace.getConfiguration;
    originalGetDiagnostics = (vscode.languages as any).getDiagnostics;
  });

  afterEach(() => {
    vscode.window.createTextEditorDecorationType = originalCreateDecorationType;
    vscode.workspace.getConfiguration = originalGetConfiguration;
    (vscode.languages as any).getDiagnostics = originalGetDiagnostics;
  });

  function mockEditor(): any {
    const decorations: Record<string, any[]> = {};
    return {
      document: { uri: { fsPath: 'test.xml', toString: () => 'test.xml' } },
      setDecorations: (type: any, ranges: any[]) => {
        decorations[type._id] = ranges;
      },
      _decorations: decorations,
    };
  }

  function createServiceWithTrackedTypes(): {
    svc: GutterDecorationService;
    types: any[];
  } {
    let typeCount = 0;
    const types: any[] = [];
    vscode.window.createTextEditorDecorationType = (() => {
      typeCount++;
      const type = { _id: `type-${typeCount}`, dispose: () => {} };
      types.push(type);
      return type;
    }) as any;
    const svc = new GutterDecorationService('/ext/path');
    return { svc, types };
  }

  describe('constructor', () => {
    it('creates two decoration types (error + warning)', () => {
      let createCount = 0;
      vscode.window.createTextEditorDecorationType = (() => {
        createCount++;
        return { dispose: () => {} };
      }) as any;
      const svc = new GutterDecorationService('/ext/path');
      assert.strictEqual(createCount, 2);
      svc.dispose();
    });
  });

  describe('updateDecorations', () => {
    it('clears decorations when showGutterWarnings is false', () => {
      const { svc, types } = createServiceWithTrackedTypes();
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string) => {
          if (key === 'validation.showGutterWarnings') return false;
          return undefined;
        },
      })) as any;

      const editor = mockEditor();
      svc.updateDecorations(editor);

      for (const type of types) {
        assert.strictEqual(editor._decorations[type._id].length, 0);
      }
      svc.dispose();
    });

    it('separates errors and warnings by line', () => {
      const { svc, types } = createServiceWithTrackedTypes();
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string, defaultValue?: unknown) => {
          if (key === 'validation.showGutterWarnings') return true;
          return defaultValue;
        },
      })) as any;

      const diagnostics = [
        {
          source: 'XML Visual Editor',
          severity: vscode.DiagnosticSeverity.Error,
          range: { start: { line: 0 } },
          message: 'err',
        },
        {
          source: 'XML Visual Editor',
          severity: vscode.DiagnosticSeverity.Warning,
          range: { start: { line: 1 } },
          message: 'warn',
        },
      ];
      (vscode.languages as any).getDiagnostics = () => diagnostics;

      const editor = mockEditor();
      svc.updateDecorations(editor);

      const errorType = types[0];
      const warningType = types[1];
      assert.strictEqual(editor._decorations[errorType._id].length, 1);
      assert.strictEqual(editor._decorations[warningType._id].length, 1);
      svc.dispose();
    });

    it('deduplicates multiple diagnostics on the same line', () => {
      const { svc, types } = createServiceWithTrackedTypes();
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string, defaultValue?: unknown) => {
          if (key === 'validation.showGutterWarnings') return true;
          return defaultValue;
        },
      })) as any;

      const diagnostics = [
        {
          source: 'XML Visual Editor',
          severity: vscode.DiagnosticSeverity.Error,
          range: { start: { line: 5 } },
          message: 'err1',
        },
        {
          source: 'XML Visual Editor',
          severity: vscode.DiagnosticSeverity.Error,
          range: { start: { line: 5 } },
          message: 'err2',
        },
      ];
      (vscode.languages as any).getDiagnostics = () => diagnostics;

      const editor = mockEditor();
      svc.updateDecorations(editor);

      const errorType = types[0];
      assert.strictEqual(
        editor._decorations[errorType._id].length,
        1,
        'Expected only one decoration per line',
      );
      svc.dispose();
    });

    it('ignores diagnostics from other sources', () => {
      const { svc, types } = createServiceWithTrackedTypes();
      vscode.workspace.getConfiguration = (() => ({
        get: (key: string, defaultValue?: unknown) => {
          if (key === 'validation.showGutterWarnings') return true;
          return defaultValue;
        },
      })) as any;

      const diagnostics = [
        {
          source: 'other-extension',
          severity: vscode.DiagnosticSeverity.Error,
          range: { start: { line: 0 } },
          message: 'not ours',
        },
      ];
      (vscode.languages as any).getDiagnostics = () => diagnostics;

      const editor = mockEditor();
      svc.updateDecorations(editor);

      for (const type of types) {
        assert.strictEqual(editor._decorations[type._id].length, 0);
      }
      svc.dispose();
    });
  });

  describe('clearDecorations', () => {
    it('sets empty arrays for both decoration types', () => {
      const { svc, types } = createServiceWithTrackedTypes();
      const editor = mockEditor();
      svc.clearDecorations(editor);

      for (const type of types) {
        assert.strictEqual(editor._decorations[type._id].length, 0);
      }
      svc.dispose();
    });
  });
});
