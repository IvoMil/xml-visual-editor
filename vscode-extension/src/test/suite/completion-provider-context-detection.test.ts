import * as assert from 'assert';
import * as vscode from 'vscode';
import { getCompletionContext } from '../../providers/xml-completion-context';
import {
  mockDocument,
  noToken,
  makeNode,
  createProvider,
  getItems,
} from './completion-provider-test-helpers';

suite('getCompletionContext', () => {
  test('detects text-content after closing tag > with no child elements', () => {
    const xml = '<root>\n  ';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 2);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'text-content');
    assert.deepStrictEqual(ctx.parentPath, ['root']);
  });

  test('detects element-content when typing < for new element', () => {
    const xml = '<root>\n  <';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 3);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'element-content');
  });

  test('detects tag-open when cursor after tag name + space', () => {
    const xml = '<root>\n  <child ';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 9);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'tag-open');
  });

  test('detects attribute-value inside quotes', () => {
    const xml = '<root>\n  <child attr="';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 15);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'attribute-value');
    assert.strictEqual(ctx.attributeName, 'attr');
  });

  test('detects text-content between > and </', () => {
    const xml = '<root>\n  <leaf>some text';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 14);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'text-content');
  });

  test('returns unknown for closing tag', () => {
    const xml = '<root>\n  </';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 4);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'unknown');
  });

  test('returns unknown for comment', () => {
    const xml = '<root>\n  <!-- ';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 7);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'unknown');
  });

  test('builds correct parentPath for nested XML', () => {
    const xml = '<root><parent><child></child>\n  <';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 3);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'element-content');
    assert.deepStrictEqual(ctx.parentPath, ['root', 'parent']);
  });

  test('comment containing tags does not corrupt parentPath', () => {
    // Regression: comments with tag-like content (e.g. <!-- <child1>old</child1> -->)
    // were being parsed as real tags, shifting sibling indices and parent paths.
    const xml = '<root>\n  <!-- <child1>old</child1> -->\n  <child1>real</child1>\n  <';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(3, 3);
    const ctx = getCompletionContext(doc, pos);
    assert.strictEqual(ctx.type, 'element-content');
    assert.deepStrictEqual(
      ctx.parentPath,
      ['root'],
      'parent should be root, not affected by comment',
    );
  });
});

suite('Completion filter regression', () => {
  test('returns completions when all elements are insertable (no before_cursor)', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'one' }),
        makeNode({ name: 'two' }),
        makeNode({ name: 'three' }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elems = items.filter((i) => {
      const lbl = typeof i.label === 'string' ? i.label : i.label.label;
      return ['one', 'two', 'three'].some((n) => lbl.includes(n));
    });
    assert.strictEqual(elems.length, 3, 'should return all three insertable elements');
  });

  test('filters elements with before_cursor=true and cursor_adjacent missing', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'a', before_cursor: true }),
        makeNode({ name: 'b', before_cursor: true }),
        makeNode({ name: 'c' }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elems = items.filter((i) => {
      const lbl = typeof i.label === 'string' ? i.label : i.label.label;
      return ['a', 'b', 'c'].some((n) => lbl.includes(n));
    });
    assert.strictEqual(elems.length, 1, 'only element without before_cursor should remain');
    const lbl = typeof elems[0].label === 'string' ? elems[0].label : elems[0].label.label;
    assert.ok(lbl.includes('c'));
  });

  test('does NOT filter choice group elements when parentChoiceExhausted=false', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          is_exhausted: false,
          cursor_adjacent: true,
          children: [
            makeNode({ name: 'optA', before_cursor: true }),
            makeNode({ name: 'optB', before_cursor: true }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const optA = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optA'));
    const optB = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optB'));
    assert.ok(optA, 'optA should NOT be filtered when parent choice not exhausted');
    assert.ok(optB, 'optB should NOT be filtered when parent choice not exhausted');
  });

  test('returns empty CompletionList (not null) when all elements filtered out', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'a', before_cursor: true }),
        makeNode({ name: 'b', before_cursor: true }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const xml = '<root>\n  <';
    const lines = xml.split('\n');
    const lastLine = lines.length - 1;
    const lastCol = lines[lastLine].length;
    const doc = mockDocument(xml);
    const pos = new vscode.Position(lastLine, lastCol);
    const result = await provider.provideCompletionItems(doc, pos, noToken, {} as any);

    assert.ok(result, 'should return a CompletionList, not null');
    const elementItems = result.items.filter((i) => i.kind === vscode.CompletionItemKind.Field);
    assert.strictEqual(elementItems.length, 0, 'element items should be empty');
    assert.strictEqual(result.isIncomplete, true, 'isIncomplete should be true');
  });
});
