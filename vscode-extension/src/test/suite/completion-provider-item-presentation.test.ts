import * as assert from 'assert';
import * as vscode from 'vscode';
import { makeNode, createProvider, getItems, mockDocument, noToken } from './completion-provider-test-helpers';

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

suite('XmlCompletionProvider — inactive branches and exhausted satisfied elements are hidden from completion list', () => {
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
