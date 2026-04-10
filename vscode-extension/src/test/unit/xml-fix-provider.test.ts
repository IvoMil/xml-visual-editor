import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { XmlFixProvider, levenshteinDistance } from '../../providers/xml-fix-provider';

describe('XmlFixProvider', () => {
  let provider: XmlFixProvider;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

  beforeEach(() => {
    provider = new XmlFixProvider();
    originalGetConfiguration = vscode.workspace.getConfiguration;
  });

  afterEach(() => {
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  function mockConfiguration(overrides: Record<string, unknown>): void {
    vscode.workspace.getConfiguration = (() => ({
      get: (key: string, defaultValue?: unknown) => {
        return key in overrides ? overrides[key] : defaultValue;
      },
    })) as any;
  }

  function mockDocument(text: string): any {
    const lines = text.split('\n');
    return {
      uri: { fsPath: 'test.xml', toString: () => 'test.xml' },
      getText: () => text,
      lineAt: (line: number) => ({
        text: lines[line] || '',
        range: {
          end: new vscode.Position(line, (lines[line] || '').length),
        },
      }),
    };
  }

  function mockContext(diagnostics: any[]): any {
    return { diagnostics };
  }

  describe('provideCodeActions', () => {
    it('returns empty when showFixSuggestions is false', () => {
      mockConfiguration({ 'validation.showFixSuggestions': false });
      const doc = mockDocument('<root/>');
      const context = mockContext([]);
      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(0, 0, 0, 7),
        context,
        {} as any,
      );
      assert.strictEqual(actions.length, 0);
    });

    it('returns empty when no diagnostics match source', () => {
      mockConfiguration({ 'validation.showFixSuggestions': true });
      const doc = mockDocument('<root/>');
      const diag = {
        source: 'other-extension',
        message: 'Missing required element: "title"',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } },
      };
      const context = mockContext([diag]);
      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(0, 0, 0, 7),
        context,
        {} as any,
      );
      assert.strictEqual(actions.length, 0);
    });

    it('creates insert action for "Missing required element" diagnostic', () => {
      mockConfiguration({ 'validation.showFixSuggestions': true });
      const doc = mockDocument('<root>\n</root>');
      const diag = {
        source: 'XML Visual Editor',
        message: 'Missing required child element: "title"',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } },
      };
      const context = mockContext([diag]);
      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(0, 0, 0, 6),
        context,
        {} as any,
      );
      assert.ok(actions.length > 0, 'Expected at least one action');
      assert.ok(
        actions[0].title.includes('title'),
        `Expected title to mention "title", got: ${actions[0].title}`,
      );
      assert.ok(actions[0].edit, 'Expected action to have an edit');
    });

    it('creates rename suggestion for "Element not expected" with typo', () => {
      mockConfiguration({ 'validation.showFixSuggestions': true });
      const doc = mockDocument('<root>\n<titl>text</titl>\n<title>other</title>\n</root>');
      const diag = {
        source: 'XML Visual Editor',
        message: 'Element "titl" is not expected',
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 22 } },
      };
      const context = mockContext([diag]);
      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(1, 0, 1, 22),
        context,
        {} as any,
      );
      const typoFix = actions.find((a) => a.title.includes('Did you mean'));
      assert.ok(typoFix, 'Expected a "Did you mean" suggestion');
      assert.ok(
        typoFix.title.includes('title'),
        `Expected suggestion for "title", got: ${typoFix.title}`,
      );
    });

    it('does not suggest rename for short element names (< 3 chars)', () => {
      mockConfiguration({ 'validation.showFixSuggestions': true });
      const doc = mockDocument('<root>\n<ab>x</ab>\n<ac>y</ac>\n</root>');
      const diag = {
        source: 'XML Visual Editor',
        message: 'Element "ab" is not expected',
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 14 } },
      };
      const context = mockContext([diag]);
      const actions = provider.provideCodeActions(
        doc,
        new vscode.Range(1, 0, 1, 14),
        context,
        {} as any,
      );
      const typoFix = actions.find((a) => a.title.includes('Did you mean'));
      assert.strictEqual(typoFix, undefined, 'Should not suggest for names < 3 chars');
    });
  });

  describe('levenshteinDistance', () => {
    it('returns 2 for "test" vs "tset" (transposition)', () => {
      assert.strictEqual(levenshteinDistance('test', 'tset'), 2);
    });

    it('returns 3 for "abc" vs "xyz"', () => {
      assert.strictEqual(levenshteinDistance('abc', 'xyz'), 3);
    });

    it('returns 0 for identical strings', () => {
      assert.strictEqual(levenshteinDistance('hello', 'hello'), 0);
    });

    it('returns length of other string when one is empty', () => {
      assert.strictEqual(levenshteinDistance('', 'abc'), 3);
      assert.strictEqual(levenshteinDistance('xyz', ''), 3);
    });

    it('returns 1 for single substitution', () => {
      assert.strictEqual(levenshteinDistance('cat', 'bat'), 1);
    });

    it('returns 1 for single insertion', () => {
      assert.strictEqual(levenshteinDistance('cat', 'cats'), 1);
    });
  });
});
