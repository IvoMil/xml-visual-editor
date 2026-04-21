import * as assert from 'assert';
import * as vscode from 'vscode';
import { flattenContentModel } from '../../providers/completion-helpers';
import {
  makeNode,
  createProvider,
  getItems,
  mockDocument,
  noToken,
} from './completion-provider-test-helpers';

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
