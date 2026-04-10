import * as assert from 'assert';
import * as vscode from 'vscode';
import { getCompletionContext } from '../../providers/xml-completion-context';
import { XmlCompletionProvider } from '../../providers/xml-completion-provider';
import { flattenContentModel } from '../../providers/completion-helpers';
import type { ContentModelNode } from '../../shared/schema-table-renderer';

// --- Helpers ---

function mockDocument(content: string, scheme = 'file'): vscode.TextDocument {
  const lines = content.split('\n');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    uri: { scheme, fsPath: '/test.xml', toString: () => 'file:///test.xml' },
    languageId: 'xml',
    lineCount: lines.length,
    getText: (range?: vscode.Range) => {
      if (!range) return content;
      const startOff =
        lines.slice(0, range.start.line).join('\n').length +
        (range.start.line > 0 ? 1 : 0) +
        range.start.character;
      const endOff =
        lines.slice(0, range.end.line).join('\n').length +
        (range.end.line > 0 ? 1 : 0) +
        range.end.character;
      return content.substring(startOff, endOff);
    },
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    offsetAt: (pos: vscode.Position) => {
      let offset = 0;
      for (let i = 0; i < pos.line; i++) {
        offset += (lines[i]?.length ?? 0) + 1; // +1 for '\n'
      }
      return offset + pos.character;
    },
    positionAt: (offset: number) => {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        if (remaining <= lines[i].length) {
          return new vscode.Position(i, remaining);
        }
        remaining -= lines[i].length + 1; // +1 for '\n'
      }
      return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    },
  } as any;
}

const noToken: vscode.CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => {} }),
} as any;

function makeNode(overrides: Partial<ContentModelNode> = {}): ContentModelNode {
  return {
    name: 'child',
    node_type: 'element',
    min_occurs: 1,
    max_occurs: 1,
    current_count: 0,
    is_satisfied: false,
    is_exhausted: false,
    can_insert: true,
    type_name: '',
    documentation: '',
    children: [],
    ...overrides,
  };
}

// --- getCompletionContext tests ---

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

// --- Additional tests (Rounds 5-8) ---

function createProvider(
  panelData: any,
  nodeDetailsResponse: any = null,
  attrResponse: any = null,
): XmlCompletionProvider {
  const engineMock = {
    isReady: () => true,
    sendRequest: (method: string, _params: any) => {
      if (method === 'document.update') return Promise.resolve({});
      if (method === 'helper.getElementsPanelData') return Promise.resolve(panelData);
      if (method === 'helper.getNodeDetails') return Promise.resolve(nodeDetailsResponse);
      if (method === 'helper.getAttributesPanelData') return Promise.resolve(attrResponse);
      return Promise.resolve({});
    },
  } as any;
  const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
  return new XmlCompletionProvider(
    engineMock,
    schemaMock,
    () => 'doc_1',
    () => false,
  );
}

async function getItems(
  provider: XmlCompletionProvider,
  xml: string,
): Promise<vscode.CompletionItem[]> {
  const lines = xml.split('\n');
  const lastLine = lines.length - 1;
  const lastCol = lines[lastLine].length;
  const doc = mockDocument(xml);
  const pos = new vscode.Position(lastLine, lastCol);
  const result = await provider.provideCompletionItems(doc, pos, noToken, {} as any);
  return result?.items ?? [];
}

suite('XmlCompletionProvider — depth indentation', () => {
  test('choice children are indented at depth 1', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [makeNode({ name: 'optA' }), makeNode({ name: 'optB' })],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const optA = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optA'));
    assert.ok(optA, 'optA should exist');
    const label = typeof optA.label !== 'string' ? optA.label.label : '';
    assert.ok(
      label.startsWith('\u00A0\u00A0'),
      `label should start with 2 NBSP for depth 1, got: "${label}"`,
    );
    assert.ok(
      !label.startsWith('\u00A0\u00A0\u00A0\u00A0'),
      `label should NOT start with 4 NBSP (depth 2), got: "${label}"`,
    );
  });

  test('sequence children inside choice are indented at depth 2', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [
            makeNode({ name: 'optA' }),
            makeNode({
              name: null,
              node_type: 'sequence',
              children: [makeNode({ name: 'seqChild1' }), makeNode({ name: 'seqChild2' })],
            }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const seqChild = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('seqChild1'),
    );
    assert.ok(seqChild, 'seqChild1 should exist');
    const label = typeof seqChild.label !== 'string' ? seqChild.label.label : '';
    assert.ok(
      label.startsWith('\u00A0\u00A0\u00A0\u00A0'),
      `label should start with 4 NBSP for depth 2, got: "${label}"`,
    );
  });
});

suite('XmlCompletionProvider — CompletionItemKind', () => {
  test('element items use CompletionItemKind.Field', async () => {
    const panelData = {
      content_model: [makeNode({ name: 'elem1' })],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elem = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('elem1'));
    assert.ok(elem, 'elem1 should exist');
    assert.strictEqual(
      elem.kind,
      vscode.CompletionItemKind.Field,
      'element should use CompletionItemKind.Field',
    );
  });

  test('choice header items use CompletionItemKind.Enum', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [makeNode({ name: 'a' }), makeNode({ name: 'b' })],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const header = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    assert.ok(header, 'choice header should exist');
    assert.strictEqual(
      header.kind,
      vscode.CompletionItemKind.Enum,
      'choice header should use CompletionItemKind.Enum',
    );
  });

  test('sequence header items use CompletionItemKind.Constant', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [
            makeNode({ name: 'optA' }),
            makeNode({
              name: null,
              node_type: 'sequence',
              children: [makeNode({ name: 'seqA' }), makeNode({ name: 'seqB' })],
            }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const seqHeader = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('sequence'),
    );
    assert.ok(seqHeader, 'sequence header should exist');
    assert.strictEqual(
      seqHeader.kind,
      vscode.CompletionItemKind.Constant,
      'sequence header should use CompletionItemKind.Constant',
    );
  });

  test('toggle filterText includes < prefix when replaceRange exists', async () => {
    const panelData = {
      content_model: [makeNode({ name: 'alpha' }), makeNode({ name: 'beta' })],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    // Trigger replaceRange by ending with '<' partial tag
    const items = await getItems(provider, '<root>\n  <');

    const toggle = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('Insert + required'),
    );
    assert.ok(toggle, 'toggle item should exist');
    assert.ok(
      toggle.filterText?.includes('<alpha'),
      `filterText should include '<alpha', got: ${toggle.filterText}`,
    );
    assert.ok(
      toggle.filterText?.includes('<beta'),
      `filterText should include '<beta', got: ${toggle.filterText}`,
    );
  });
});

suite('XmlCompletionProvider — choice group filtering', () => {
  test('repeatable choice: non-exhausted elements before cursor shown', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 'unbounded' as any,
          is_exhausted: false,
          cursor_adjacent: true,
          children: [
            makeNode({
              name: 'activity',
              current_count: 1,
              is_satisfied: true,
              is_exhausted: false,
              can_insert: true,
              before_cursor: true,
            }),
            makeNode({ name: 'parallel', current_count: 0, before_cursor: true }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const activity = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('activity'),
    );
    assert.ok(activity, 'non-exhausted choice element before cursor should be shown');
  });

  test('exhausted choice elements are hidden when before_cursor', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          is_exhausted: true,
          children: [
            makeNode({
              name: 'optA',
              current_count: 1,
              is_satisfied: true,
              is_exhausted: true,
              can_insert: false,
              before_cursor: true,
            }),
            makeNode({ name: 'optB', current_count: 0, before_cursor: true }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const optA = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optA'));
    assert.ok(!optA, 'optA should be filtered (exhausted, before_cursor)');
  });
});

suite('XmlCompletionProvider — Bug 10 filter rules', () => {
  // Rule 1: Inactive branches are ALWAYS hidden
  test('Rule 1: inactive branch elements are always hidden', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          is_exhausted: true,
          active_branch: 'optA',
          children: [
            makeNode({
              name: 'optA',
              current_count: 1,
              is_satisfied: true,
              is_exhausted: true,
              can_insert: false,
            }),
            makeNode({ name: 'optB', current_count: 0 }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const optB = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optB'));
    assert.ok(!optB, 'optB (inactive branch) should be hidden');
  });

  test('Rule 1: inactive branch hidden even when after cursor', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          is_exhausted: true,
          active_branch: 'optA',
          children: [
            makeNode({
              name: 'optA',
              current_count: 1,
              is_satisfied: true,
              is_exhausted: true,
              can_insert: false,
              before_cursor: true,
            }),
            makeNode({ name: 'optB', current_count: 0, before_cursor: false }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const optB = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optB'));
    assert.ok(!optB, 'optB (inactive branch) should be hidden even after cursor');
  });

  // Rule 2a: Active-branch exhausted elements BEFORE cursor are hidden
  test('Rule 2a: active-branch exhausted element before cursor is hidden', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 0,
          max_occurs: 1,
          is_exhausted: true,
          active_branch: 'name',
          children: [
            makeNode({
              name: 'name',
              current_count: 1,
              is_satisfied: true,
              is_exhausted: true,
              can_insert: false,
              before_cursor: true,
            }),
            makeNode({ name: 'useExternalId', current_count: 0 }),
          ],
        }),
        makeNode({ name: 'prefix', min_occurs: 0, max_occurs: 1 }),
        makeNode({ name: 'suffix', min_occurs: 0, max_occurs: 1 }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const nameItem = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('name'),
    );
    assert.ok(!nameItem, 'name (active-branch exhausted before cursor) should be hidden');
  });

  // Rule 3: Active-branch exhausted elements AFTER cursor are shown as "(present)"
  test('Rule 3: active-branch exhausted element after cursor is shown as "(present)"', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 0,
          max_occurs: 1,
          is_exhausted: true,
          active_branch: 'name',
          children: [
            makeNode({
              name: 'name',
              current_count: 1,
              is_satisfied: true,
              is_exhausted: true,
              can_insert: false,
              before_cursor: false,
            }),
            makeNode({ name: 'useExternalId', current_count: 0 }),
          ],
        }),
        makeNode({ name: 'prefix', min_occurs: 0, max_occurs: 1 }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const nameItem = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('name'),
    );
    assert.ok(nameItem, 'name (active-branch exhausted after cursor) should be shown');
    const desc = typeof nameItem.label !== 'string' ? nameItem.label.description : '';
    assert.ok(
      desc?.includes('(present)'),
      `description should contain "(present)", got: "${desc}"`,
    );
  });

  // Rule 2c: Non-choice before-cursor elements without exhaustion are hidden
  test('Rule 2c: non-choice before-cursor elements are hidden', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'elem1', before_cursor: true }),
        makeNode({ name: 'elem2', before_cursor: true }),
        makeNode({ name: 'elem3' }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elem1 = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('elem1'));
    const elem2 = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('elem2'));
    const elem3 = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('elem3'));
    assert.ok(!elem1, 'elem1 (before cursor) should be hidden');
    assert.ok(!elem2, 'elem2 (before cursor) should be hidden');
    assert.ok(elem3, 'elem3 (after cursor) should be shown');
  });

  // Rule 2b: Choice group elements before cursor that can still accept instances are shown
  test('Rule 2b: active choice group elements before cursor shown when not exhausted', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 'unbounded' as any,
          is_exhausted: false,
          cursor_adjacent: true,
          active_branch: 'activity',
          children: [
            makeNode({
              name: 'activity',
              current_count: 1,
              is_satisfied: true,
              is_exhausted: false,
              can_insert: true,
              before_cursor: true,
            }),
            makeNode({ name: 'parallel', current_count: 0, before_cursor: true }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const activity = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('activity'),
    );
    assert.ok(
      activity,
      'activity (active branch in choice, before cursor, not exhausted) should be shown',
    );
  });

  // cursor_adjacent overrides before_cursor rules
  test('cursor_adjacent elements are always shown regardless of before_cursor', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'adjacent', before_cursor: true, cursor_adjacent: true }),
        makeNode({ name: 'beforeOnly', before_cursor: true }),
        makeNode({ name: 'afterCursor' }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const adj = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('adjacent'),
    );
    const beforeOnly = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('beforeOnly'),
    );
    const afterCursor = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('afterCursor'),
    );
    assert.ok(adj, 'cursor_adjacent element should be shown despite before_cursor');
    assert.ok(!beforeOnly, 'before_cursor without cursor_adjacent should be hidden');
    assert.ok(afterCursor, 'after cursor element should be shown');
  });

  // Exhausted element after cursor shows with (present) description
  test('exhausted non-choice element after cursor shows as "(present)"', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: 'title',
          min_occurs: 1,
          max_occurs: 1,
          current_count: 1,
          is_satisfied: true,
          is_exhausted: true,
          can_insert: false,
          before_cursor: false,
        }),
        makeNode({ name: 'footer', min_occurs: 0, max_occurs: 1 }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const title = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('title'));
    assert.ok(title, 'exhausted element after cursor should be shown');
    const desc = typeof title.label !== 'string' ? title.label.description : '';
    assert.ok(desc?.includes('(present)'), `should show "(present)", got: "${desc}"`);
  });
});

suite('XmlCompletionProvider — placeholder documentation', () => {
  test('all elements have placeholder documentation', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'noType', type_name: '' }),
        makeNode({ name: 'hasType', type_name: 'SomeType' }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const noType = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('noType'),
    );
    assert.ok(noType, 'noType should exist');
    assert.ok(
      noType.documentation instanceof vscode.MarkdownString,
      'noType should have markdown documentation',
    );

    const hasType = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('hasType'),
    );
    assert.ok(hasType, 'hasType should exist');
    assert.ok(
      hasType.documentation instanceof vscode.MarkdownString,
      'hasType should have markdown documentation',
    );
    const md = hasType.documentation;
    assert.ok(
      md instanceof vscode.MarkdownString && md.value.includes('SomeType'),
      'should include type_name in placeholder',
    );
  });
});

suite('XmlCompletionProvider — isIncomplete flag', () => {
  test('element completion list has isIncomplete=true', async () => {
    const panelData = {
      content_model: [makeNode({ name: 'elem' })],
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
    assert.ok(result, 'result should exist');
    assert.strictEqual(result.isIncomplete, true, 'CompletionList.isIncomplete should be true');
  });
});

// --- XmlCompletionProvider tests ---

suite('XmlCompletionProvider — element completions', () => {
  function createProvider(
    panelData: any,
    nodeDetailsResponse: any = null,
    attrResponse: any = null,
  ): XmlCompletionProvider {
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string, _params: any) => {
        if (method === 'document.update') return Promise.resolve({});
        if (method === 'helper.getElementsPanelData') return Promise.resolve(panelData);
        if (method === 'helper.getNodeDetails') return Promise.resolve(nodeDetailsResponse);
        if (method === 'helper.getAttributesPanelData') return Promise.resolve(attrResponse);
        return Promise.resolve({});
      },
    } as any;
    const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
    return new XmlCompletionProvider(
      engineMock,
      schemaMock,
      () => 'doc_1',
      () => false,
    );
  }

  async function getItems(
    provider: XmlCompletionProvider,
    xml: string,
  ): Promise<vscode.CompletionItem[]> {
    const lines = xml.split('\n');
    const lastLine = lines.length - 1;
    const lastCol = lines[lastLine].length;
    const doc = mockDocument(xml);
    const pos = new vscode.Position(lastLine, lastCol);
    const result = await provider.provideCompletionItems(doc, pos, noToken, {} as any);
    return result?.items ?? [];
  }

  test('inactive choice branch is hidden by Rule 1', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          active_branch: 'branchA',
          children: [
            makeNode({ name: 'branchA', current_count: 1, is_satisfied: true }),
            makeNode({ name: 'branchB', current_count: 0 }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const branchB = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('branchB'),
    );
    assert.ok(!branchB, 'branchB (inactive branch) should be hidden by Rule 1');
  });

  test('active choice branch does NOT get Deprecated tag', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          active_branch: 'branchA',
          children: [
            makeNode({ name: 'branchA', current_count: 1, is_satisfied: true }),
            makeNode({ name: 'branchB', current_count: 0 }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const branchA = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('branchA'),
    );
    assert.ok(branchA, 'branchA item should exist');
    assert.ok(
      !branchA.tags || !branchA.tags.includes(vscode.CompletionItemTag.Deprecated),
      'active branch should NOT be Deprecated',
    );
  });

  test('remaining count shows (∞ left) for satisfied unbounded element', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: 'items',
          min_occurs: 1,
          max_occurs: 'unbounded' as any,
          current_count: 3,
          is_satisfied: true,
          is_exhausted: false,
          can_insert: true,
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elem = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('items'));
    assert.ok(elem, 'items element should exist');
    const desc = typeof elem.label !== 'string' ? elem.label.description : '';
    assert.ok(desc?.includes('\u221E left'), `description should contain "∞ left", got: ${desc}`);
  });

  test('exhausted element shows (present)', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: 'single',
          min_occurs: 1,
          max_occurs: 1,
          current_count: 1,
          is_satisfied: true,
          is_exhausted: true,
          can_insert: false,
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elem = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('single'));
    assert.ok(elem, 'single element should exist');
    const desc = typeof elem.label !== 'string' ? elem.label.description : '';
    assert.ok(desc?.includes('(present)'), `description should contain "(present)", got: ${desc}`);
  });

  test('required unsatisfied element shows cardinality with (required)', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: 'req',
          min_occurs: 1,
          max_occurs: 5,
          current_count: 0,
          is_satisfied: false,
          is_exhausted: false,
          can_insert: true,
        }),
      ],
      content_complete: false,
      missing_required: ['req'],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elem = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('<> req'));
    assert.ok(elem, 'req element should exist');
    const desc = typeof elem.label !== 'string' ? elem.label.description : '';
    assert.ok(
      desc?.includes('1..5'),
      `description should contain cardinality "1..5", got: ${desc}`,
    );
    assert.ok(
      desc?.includes('(required)'),
      `description should contain "(required)", got: ${desc}`,
    );
  });

  test('optional element shows only cardinality', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: 'opt',
          min_occurs: 0,
          max_occurs: 1,
          current_count: 0,
          is_satisfied: false,
          is_exhausted: false,
          can_insert: true,
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const elem = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('opt'));
    assert.ok(elem, 'opt element should exist');
    const desc = typeof elem.label !== 'string' ? elem.label.description : '';
    assert.strictEqual(desc, '0..1');
  });

  test('choice header shows option count and active branch', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          active_branch: 'optA',
          children: [
            makeNode({ name: 'optA' }),
            makeNode({ name: 'optB' }),
            makeNode({ name: 'optC' }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const header = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    assert.ok(header, 'choice header should exist');
    const desc = typeof header.label !== 'string' ? header.label.description : '';
    assert.ok(desc?.includes('3 options'), `should show 3 options, got: ${desc}`);
    assert.ok(desc?.includes('active: optA'), `should show active branch, got: ${desc}`);
  });

  test('required choice header shows (required)', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          current_count: 0,
          is_exhausted: false,
          children: [makeNode({ name: 'optA' }), makeNode({ name: 'optB' })],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const header = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    assert.ok(header, 'choice header should exist');
    const desc = typeof header.label !== 'string' ? header.label.description : '';
    assert.ok(desc?.includes('(required)'), `choice should show (required), got: ${desc}`);
  });

  test('optional choice header does not show (required)', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 0,
          max_occurs: 1,
          current_count: 0,
          is_exhausted: false,
          children: [makeNode({ name: 'optA' }), makeNode({ name: 'optB' })],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const header = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    assert.ok(header, 'choice header should exist');
    const desc = typeof header.label !== 'string' ? header.label.description : '';
    assert.ok(
      !desc?.includes('(required)'),
      `optional choice should NOT show (required), got: ${desc}`,
    );
  });

  test('exhausted choice header is removed when all children filtered', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          current_count: 1,
          is_exhausted: true,
          children: [
            makeNode({ name: 'optA', before_cursor: true, is_exhausted: true }),
            makeNode({ name: 'optB', before_cursor: true, is_exhausted: true }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const header = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    assert.ok(!header, 'exhausted choice header should be removed when all children are filtered');
  });

  test('sequence header appears for nested sequences with >1 children', async () => {
    // Sequence headers only appear at depth > 0, so nest in a choice
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [
            makeNode({
              name: null,
              node_type: 'sequence',
              children: [makeNode({ name: 'a' }), makeNode({ name: 'b' })],
            }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const seqHeader = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('sequence'),
    );
    assert.ok(seqHeader, 'sequence header should exist for nested sequence with >1 children');
  });

  test('toggle item is first and comment item is last', async () => {
    const panelData = {
      content_model: [makeNode({ name: 'el' })],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    assert.ok(items.length >= 3, 'should have toggle + element + comment');
    const firstLabel = typeof items[0].label !== 'string' ? items[0].label.label : items[0].label;
    assert.ok(
      firstLabel.includes('Insert + required'),
      `first item should be toggle, got: ${firstLabel}`,
    );
    const lastItem = items[items.length - 1];
    const lastLabel = typeof lastItem.label !== 'string' ? lastItem.label.label : lastItem.label;
    assert.ok(lastLabel.includes('Comment'), `last item should be comment, got: ${lastLabel}`);
  });

  test('completions correct when XML comments contain tag-like content', async () => {
    // Regression: comments like <!-- <child1>old</child1> --> were parsed as real
    // tags, corrupting parentPath so the wrong allowed-children were returned.
    const panelData = {
      content_model: [makeNode({ name: 'child1' }), makeNode({ name: 'child2' })],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const xml = '<root>\n  <!-- <child1>old</child1> -->\n  <child1>real</child1>\n  <';
    const items = await getItems(provider, xml);

    const child2 = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('child2'),
    );
    assert.ok(child2, 'child2 should appear — comment must not affect element detection');
  });
});

suite('XmlCompletionProvider — completion filter regression tests', () => {
  test('All elements before_cursor but parent cursor_adjacent still shows completions', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'sequence',
          children: [
            makeNode({ name: 'a', before_cursor: true, cursor_adjacent: true }),
            makeNode({ name: 'b', before_cursor: true, cursor_adjacent: true }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const a = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('a'));
    const b = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('b'));
    assert.ok(a, 'element a should be present despite before_cursor');
    assert.ok(b, 'element b should be present despite before_cursor');
  });

  test('No elements match filter returns empty CompletionList (not null) with isIncomplete=true', async () => {
    const panelData = {
      content_model: [],
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

    assert.strictEqual(result, null, 'should return null for empty content_model');
  });

  test('flattenContentModel produces items for simple content model', async () => {
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
    assert.strictEqual(elems.length, 3, 'should produce three element items');
  });

  test('Filter does not remove elements without before_cursor set', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'after' }),
        makeNode({ name: 'before', before_cursor: true }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const after = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('after'));
    assert.ok(after, 'element without before_cursor should pass filter');
  });

  test('Rule 2b: choice group before_cursor elements shown when not exhausted', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          is_exhausted: false,
          cursor_adjacent: true,
          children: [
            makeNode({
              name: 'optA',
              before_cursor: true,
              current_count: 1,
              is_satisfied: true,
              is_exhausted: false,
              can_insert: true,
            }),
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
    assert.ok(optA, 'optA should be shown when in choice group and not exhausted (Rule 2b)');
    const optB = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optB'));
    assert.ok(optB, 'optB should be shown when in choice group and not exhausted (Rule 2b)');
  });

  test('filters out exhausted choice elements (parentChoiceExhausted=true)', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          is_exhausted: true,
          max_occurs: 1,
          current_count: 1,
          children: [
            makeNode({
              name: 'moduleInstanceId',
              before_cursor: true,
              current_count: 1,
              is_exhausted: true,
            }),
            makeNode({ name: 'otherOption', before_cursor: true, is_exhausted: true }),
          ],
        }),
        makeNode({ name: 'afterChoice' }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const mod = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('moduleInstanceId'),
    );
    const other = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('otherOption'),
    );
    const choiceHeader = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    const after = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('afterChoice'),
    );
    assert.ok(!mod, 'exhausted choice element should be filtered out');
    assert.ok(!other, 'sibling in exhausted choice should be filtered out');
    assert.ok(!choiceHeader, 'orphan choice header should be removed');
    assert.ok(after, 'non-choice element should remain');
  });

  test('individually exhausted elements remain visible with (present) label', async () => {
    const panelData = {
      content_model: [
        makeNode({ name: 'done', is_exhausted: true, current_count: 1, max_occurs: 1 }),
        makeNode({ name: 'available', is_exhausted: false }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const done = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('done'));
    const avail = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('available'),
    );
    assert.ok(done, 'individually exhausted element should remain visible');
    assert.ok(avail, 'non-exhausted element should remain');
    const desc = typeof done.label !== 'string' ? done.label.description : '';
    assert.ok(desc?.includes('(present)'), `exhausted element should show (present), got: ${desc}`);
  });

  test('non-exhausted choice remains fully visible', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          is_exhausted: false,
          max_occurs: 'unbounded' as any,
          children: [
            makeNode({ name: 'optX', is_exhausted: false }),
            makeNode({ name: 'optY', is_exhausted: false }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const optX = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optX'));
    const optY = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('optY'));
    assert.ok(optX, 'optX should remain visible in non-exhausted choice');
    assert.ok(optY, 'optY should remain visible in non-exhausted choice');
  });
});

suite('XmlCompletionProvider — text-content completions', () => {
  function createProviderForText(nodeDetailsResponse: any): {
    provider: XmlCompletionProvider;
    calls: any[];
  } {
    const calls: any[] = [];
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string, params: any) => {
        calls.push({ method, params });
        if (method === 'document.update') return Promise.resolve({});
        if (method === 'helper.getNodeDetails') {
          if (nodeDetailsResponse instanceof Error) return Promise.reject(nodeDetailsResponse);
          return Promise.resolve(nodeDetailsResponse);
        }
        return Promise.resolve({});
      },
    } as any;
    const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
    const provider = new XmlCompletionProvider(
      engineMock,
      schemaMock,
      () => 'doc_1',
      () => false,
    );
    return { provider, calls };
  }

  async function getItemsLocal(provider: XmlCompletionProvider, xml: string) {
    const lines = xml.split('\n');
    const lastLine = lines.length - 1;
    const lastCol = lines[lastLine].length;
    const doc = mockDocument(xml);
    const pos = new vscode.Position(lastLine, lastCol);
    const result = await provider.provideCompletionItems(doc, pos, noToken, {} as any);
    return result?.items ?? [];
  }

  test('text-content completions resolve type via helper.getNodeDetails with path-based resolution', async () => {
    const { provider, calls } = createProviderForText({
      type_name: 'LeafType',
      enum_values: ['one', 'two'],
    });
    const items = await getItemsLocal(provider, '<root>\n  <leaf>');
    assert.strictEqual(items.length, 2);
    // should call helper.getNodeDetails with element_path
    const detailsCall = calls.find((c) => c.method === 'helper.getNodeDetails');
    assert.ok(detailsCall, 'expected helper.getNodeDetails to be called');
    assert.strictEqual(detailsCall.params.element_name, 'leaf');
    assert.ok(detailsCall.params.element_path, 'expected element_path to be passed');
    // verify returned items
    const labels = items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.deepStrictEqual(labels, ['one', 'two']);
  });

  test('text-content completions return null when getNodeDetails fails', async () => {
    const { provider } = createProviderForText(new Error('fail'));
    const items = await getItemsLocal(provider, '<root>\n  <leaf>');
    assert.strictEqual(items.length, 0);
  });

  test('text-content completions return null when no enum values', async () => {
    const { provider } = createProviderForText({ type_name: 'LeafType', enum_values: [] });
    const items = await getItemsLocal(provider, '<root>\n  <leaf>');
    assert.strictEqual(items.length, 0);
  });
});

suite('XmlCompletionProvider — resolveCompletionItem', () => {
  test('returns enriched documentation from engine', async () => {
    const nodeDetails = {
      name: 'TestEl',
      type_name: 'TestType',
      documentation: 'Test doc text',
      xpath: '/root/TestEl',
      min_occurs: 1,
      max_occurs: 1,
    };
    const attrData = {
      attributes: [
        {
          name: 'id',
          type_name: 'xs:int',
          use: 'required',
          is_set: false,
          enum_values: [],
          documentation: '',
          default_value: null,
          fixed_value: null,
        },
      ],
    };
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string) => {
        if (method === 'document.update') return Promise.resolve({});
        if (method === 'helper.getElementsPanelData')
          return Promise.resolve({
            content_model: [
              makeNode({ name: 'TestEl', type_name: 'TestType', documentation: 'Test doc text' }),
            ],
            content_complete: false,
            missing_required: [],
          });
        if (method === 'helper.getNodeDetails') return Promise.resolve(nodeDetails);
        if (method === 'helper.getAttributesPanelData') return Promise.resolve(attrData);
        return Promise.resolve({});
      },
    } as any;
    const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
    const provider = new XmlCompletionProvider(
      engineMock,
      schemaMock,
      () => 'doc_1',
      () => false,
    );

    // First trigger provideCompletionItems to populate resolveDataMap
    const xml = '<root>\n  <';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 3);
    const list = await provider.provideCompletionItems(doc, pos, noToken, {} as any);
    assert.ok(list);

    // Find the element item
    const elemItem = list.items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('TestEl'),
    );
    assert.ok(elemItem, 'TestEl item should exist');

    // Resolve it
    const resolved = await provider.resolveCompletionItem(elemItem, noToken);
    assert.ok(resolved.documentation instanceof vscode.MarkdownString);
    const mdValue = resolved.documentation.value;
    assert.ok(mdValue.includes('**TestEl**'), 'should have element name');
    assert.ok(mdValue.includes('Test doc text'), 'should have documentation');
    assert.ok(mdValue.includes('`id`'), 'should have attribute name');
  });

  test('keeps original documentation on engine failure', async () => {
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string) => {
        if (method === 'document.update') return Promise.resolve({});
        if (method === 'helper.getElementsPanelData')
          return Promise.resolve({
            content_model: [makeNode({ name: 'FailEl' })],
            content_complete: false,
            missing_required: [],
          });
        if (method === 'helper.getNodeDetails') return Promise.reject(new Error('fail'));
        if (method === 'helper.getAttributesPanelData') return Promise.reject(new Error('fail'));
        return Promise.resolve({});
      },
    } as any;
    const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
    const provider = new XmlCompletionProvider(
      engineMock,
      schemaMock,
      () => 'doc_1',
      () => false,
    );

    const xml = '<root>\n  <';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 3);
    await provider.provideCompletionItems(doc, pos, noToken, {} as any);

    // Create an item with no resolveKey match
    const item = new vscode.CompletionItem('nonexistent');
    item.documentation = new vscode.MarkdownString('original');
    const resolved = await provider.resolveCompletionItem(item, noToken);
    assert.ok(
      resolved.documentation instanceof vscode.MarkdownString &&
        resolved.documentation.value === 'original',
    );
  });
});

suite('Bug A regression — Rule 2b parentChoiceNode.cursor_adjacent guard', () => {
  test('choice element before cursor SHOWN when parentChoiceNode.cursor_adjacent=true', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 'unbounded' as any,
          is_exhausted: false,
          cursor_adjacent: true,
          children: [
            makeNode({
              name: 'taskA',
              before_cursor: true,
              cursor_adjacent: false,
              is_exhausted: false,
              can_insert: true,
            }),
            makeNode({
              name: 'taskB',
              before_cursor: true,
              cursor_adjacent: false,
              is_exhausted: false,
              can_insert: true,
            }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const taskA = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('taskA'));
    const taskB = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('taskB'));
    assert.ok(taskA, 'taskA should be shown — parent choice is cursor_adjacent');
    assert.ok(taskB, 'taskB should be shown — parent choice is cursor_adjacent');
  });

  test('choice element before cursor HIDDEN when parentChoiceNode.cursor_adjacent=false', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 'unbounded' as any,
          is_exhausted: false,
          cursor_adjacent: false,
          children: [
            makeNode({
              name: 'taskA',
              before_cursor: true,
              cursor_adjacent: false,
              is_exhausted: false,
              can_insert: true,
            }),
            makeNode({
              name: 'taskB',
              before_cursor: true,
              cursor_adjacent: false,
              is_exhausted: false,
              can_insert: true,
            }),
          ],
        }),
        makeNode({ name: 'afterElement' }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const taskA = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('taskA'));
    const taskB = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('taskB'));
    const after = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('afterElement'),
    );
    assert.ok(!taskA, 'taskA should be HIDDEN — parent choice is NOT cursor_adjacent');
    assert.ok(!taskB, 'taskB should be HIDDEN — parent choice is NOT cursor_adjacent');
    assert.ok(after, 'afterElement (no before_cursor) should still be shown');
  });

  test('choice element before cursor HIDDEN when parentChoiceNode.cursor_adjacent is undefined', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 'unbounded' as any,
          is_exhausted: false,
          // cursor_adjacent not set → undefined
          children: [
            makeNode({
              name: 'taskA',
              before_cursor: true,
              is_exhausted: false,
              can_insert: true,
            }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const taskA = items.find((i) => typeof i.label !== 'string' && i.label.label.includes('taskA'));
    assert.ok(!taskA, 'taskA should be HIDDEN — parent choice cursor_adjacent is undefined');
  });
});

suite('Regression — flattenContentModel choice with sequence branch active_branch', () => {
  test('active sequence branch elements are NOT marked isInactiveBranch', () => {
    // Build a choice with:
    //   branch 1: sequence [firstCellCenter, xCellSize, yCellSize]  (active)
    //   branch 2: element  gridCorners                               (inactive)
    const choiceNode = makeNode({
      name: '',
      node_type: 'choice',
      active_branch: 'firstCellCenter',
      children: [
        makeNode({
          name: '',
          node_type: 'sequence',
          children: [
            makeNode({ name: 'firstCellCenter', current_count: 1 }),
            makeNode({ name: 'xCellSize' }),
            makeNode({ name: 'yCellSize' }),
          ],
        }),
        makeNode({ name: 'gridCorners' }),
      ],
    });

    // Call the standalone helper function directly
    const entries = flattenContentModel([choiceNode], 0);

    const elementEntries = entries.filter((e: any) => e.type === 'element');
    const firstCell = elementEntries.find((e: any) => e.name === 'firstCellCenter');
    const xCell = elementEntries.find((e: any) => e.name === 'xCellSize');
    const yCell = elementEntries.find((e: any) => e.name === 'yCellSize');
    const gridCorners = elementEntries.find((e: any) => e.name === 'gridCorners');

    assert.ok(firstCell, 'firstCellCenter should be in entries');
    assert.ok(xCell, 'xCellSize should be in entries');
    assert.ok(yCell, 'yCellSize should be in entries');
    assert.ok(gridCorners, 'gridCorners should be in entries');

    // Active sequence branch: none should be inactive
    assert.strictEqual(firstCell.isInactiveBranch, false, 'firstCellCenter should NOT be inactive');
    assert.strictEqual(xCell.isInactiveBranch, false, 'xCellSize should NOT be inactive');
    assert.strictEqual(yCell.isInactiveBranch, false, 'yCellSize should NOT be inactive');

    // Standalone element in other branch: should be inactive
    assert.strictEqual(gridCorners.isInactiveBranch, true, 'gridCorners SHOULD be inactive');
  });
});

suite('Compositor header — completionInsertElement command', () => {
  test('sequence header with element children has command with first element name', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [
            makeNode({ name: 'optA' }),
            makeNode({
              name: null,
              node_type: 'sequence',
              children: [makeNode({ name: 'seqFirst' }), makeNode({ name: 'seqSecond' })],
            }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const seqHeader = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('sequence'),
    );
    assert.ok(seqHeader, 'sequence header should exist');
    assert.ok(seqHeader.command, 'sequence header should have a command');
    assert.strictEqual(
      seqHeader.command.command,
      'xmlVisualEditor.completionInsertElement',
      'command name should match',
    );
    assert.strictEqual(
      seqHeader.command.arguments?.[0],
      'seqFirst',
      'command argument should be the first element name',
    );
  });

  test('choice header with element children has command with first element name', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [makeNode({ name: 'pickMe' }), makeNode({ name: 'orMe' })],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const choiceHeader = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    assert.ok(choiceHeader, 'choice header should exist');
    assert.ok(choiceHeader.command, 'choice header should have a command');
    assert.strictEqual(choiceHeader.command.command, 'xmlVisualEditor.completionInsertElement');
    assert.strictEqual(
      choiceHeader.command.arguments?.[0],
      'pickMe',
      'command argument should be the first element name',
    );
  });

  test('compositor header with only wildcard children is removed (no element children)', async () => {
    const panelData = {
      content_model: [
        makeNode({
          name: null,
          node_type: 'choice',
          min_occurs: 1,
          max_occurs: 1,
          children: [
            makeNode({ name: '*', is_wildcard: true }),
            makeNode({ name: '*', is_wildcard: true }),
          ],
        }),
      ],
      content_complete: false,
      missing_required: [],
    };
    const provider = createProvider(panelData);
    const items = await getItems(provider, '<root>\n  <');

    const choiceHeader = items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('choice'),
    );
    assert.strictEqual(
      choiceHeader,
      undefined,
      'wildcard-only compositor header should be removed (no element children)',
    );
  });
});
