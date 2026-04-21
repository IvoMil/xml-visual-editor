import * as assert from 'assert';
import * as vscode from 'vscode';
import { makeNode, createProvider, getItems } from './completion-provider-test-helpers';

suite('XmlCompletionProvider — element completions', () => {
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
