import { strict as assert } from 'assert';
import {
  getTableHtml,
  buildContentModelRows,
  getFirstInsertableElement,
  ContentModelNode,
  RowBuilderState,
} from '../../shared/schema-table-renderer';

function makeNode(overrides: Partial<ContentModelNode> & { name: string }): ContentModelNode {
  return {
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
  } as ContentModelNode;
}

describe('getTableHtml', () => {
  it('Schema Structure header includes expand/collapse buttons', () => {
    const html = getTableHtml('');
    assert.ok(
      html.includes('expandAll()'),
      'header should contain expandAll() button onclick handler',
    );
    assert.ok(
      html.includes('collapseAll()'),
      'header should contain collapseAll() button onclick handler',
    );
    assert.ok(html.includes('Expand All'), 'header should contain Expand All button title');
    assert.ok(html.includes('Collapse All'), 'header should contain Collapse All button title');
    assert.ok(html.includes('Schema Structure'), 'header should contain Schema Structure title');
  });
});

describe('buildContentModelRows - inactive choice branch Insert button', () => {
  it('inactive branch element should NOT show Insert button', () => {
    const node = makeNode({
      name: 'locationSetId',
      can_insert: false,
      current_count: 0,
      is_exhausted: false,
      is_satisfied: false,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    // activeBranchContext = 'locationId' means locationSetId is in an inactive branch
    const html = buildContentModelRows(node, 1, state, 10, true, 'locationId');
    assert.ok(
      !html.includes('insert-action'),
      'inactive branch element should not have Insert button',
    );
    assert.ok(html.includes('inactive-branch'), 'element should have inactive-branch class');
  });

  it('active branch element should show Insert button', () => {
    const node = makeNode({
      name: 'locationId',
      can_insert: true,
      current_count: 1,
      is_exhausted: false,
      is_satisfied: true,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 1, state, 10, true, 'locationId');
    assert.ok(html.includes('insert-action'), 'active branch element should have Insert button');
    assert.ok(!html.includes('inactive-branch'), 'element should not have inactive-branch class');
  });

  it('inactive branch element with cursor_adjacent should still NOT show Insert', () => {
    const node = makeNode({
      name: 'locationSetId',
      can_insert: false,
      current_count: 0,
      is_exhausted: false,
      is_satisfied: false,
      cursor_adjacent: true,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 1, state, 10, true, 'locationId');
    assert.ok(
      !html.includes('insert-action'),
      'inactive branch + cursor_adjacent should not show Insert',
    );
  });
});

describe('buildContentModelRows - wildcard (xs:any) rendering', () => {
  it('wildcard element shows ⊘ icon and (any) display name', () => {
    const node = makeNode({
      name: '*',
      is_wildcard: true,
      can_insert: false,
      type_name: 'any',
      namespace_constraint: '##other',
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('\u2298'), 'wildcard should show ⊘ icon');
    assert.ok(html.includes('(any)'), 'wildcard should show (any) display name');
    assert.ok(!html.includes('insert-action'), 'wildcard should NOT show Insert button');
    assert.ok(html.includes('wildcard-row'), 'wildcard row should have wildcard-row class');
  });

  it('wildcard shows namespace constraint badge', () => {
    const node = makeNode({
      name: '*',
      is_wildcard: true,
      can_insert: false,
      namespace_constraint: '##other',
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('##other'), 'wildcard should display namespace constraint');
    assert.ok(html.includes('compositor-badge'), 'namespace constraint should be in a badge');
  });

  it('wildcard without namespace constraint has no badge', () => {
    const node = makeNode({
      name: '*',
      is_wildcard: true,
      can_insert: false,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('(any)'), 'wildcard should still show (any)');
    assert.ok(!html.includes('compositor-badge'), 'no namespace constraint means no badge');
  });

  it('wildcard shows documentation in doc column', () => {
    const node = makeNode({
      name: '*',
      is_wildcard: true,
      can_insert: false,
      documentation: 'Extension point for external elements',
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(
      html.includes('Extension point for external elements'),
      'wildcard documentation should appear',
    );
  });

  it('wildcard preserves cardinality chip', () => {
    const node = makeNode({
      name: '*',
      is_wildcard: true,
      can_insert: false,
      min_occurs: 0,
      max_occurs: 'unbounded' as unknown as number,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(
      html.includes('cardinality-chip'),
      'wildcard should still show cardinality chip for non-1..1',
    );
  });

  it('non-wildcard element does NOT get wildcard rendering', () => {
    const node = makeNode({
      name: 'known',
      can_insert: true,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(!html.includes('wildcard-row'), 'regular element should not have wildcard-row class');
    assert.ok(!html.includes('\u2298'), 'regular element should not show ⊘ icon');
    assert.ok(!html.includes('(any)'), 'regular element should not show (any)');
  });
});

describe('getFirstInsertableElement', () => {
  it('sequence with direct element children returns first element name', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      children: [makeNode({ name: 'alpha' }), makeNode({ name: 'beta' })],
    });
    assert.strictEqual(getFirstInsertableElement(node), 'alpha');
  });

  it('choice with direct element children returns first element name', () => {
    const node = makeNode({
      name: '',
      node_type: 'choice',
      children: [makeNode({ name: 'optA' }), makeNode({ name: 'optB' })],
    });
    assert.strictEqual(getFirstInsertableElement(node), 'optA');
  });

  it('compositor with only wildcard children returns undefined', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      children: [
        makeNode({ name: '*', is_wildcard: true }),
        makeNode({ name: '*', is_wildcard: true }),
      ],
    });
    assert.strictEqual(getFirstInsertableElement(node), undefined);
  });

  it('nested compositor recurses and returns element name', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      children: [
        makeNode({
          name: '',
          node_type: 'choice',
          children: [makeNode({ name: 'deepElement' })],
        }),
      ],
    });
    assert.strictEqual(getFirstInsertableElement(node), 'deepElement');
  });

  it('empty children array returns undefined', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      children: [],
    });
    assert.strictEqual(getFirstInsertableElement(node), undefined);
  });

  it('skips wildcard and returns next element', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      children: [makeNode({ name: '*', is_wildcard: true }), makeNode({ name: 'realElement' })],
    });
    assert.strictEqual(getFirstInsertableElement(node), 'realElement');
  });
});

describe('buildContentModelRows - compositor insert button', () => {
  it('compositor with can_insert=true, not exhausted, and element children shows Insert button', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      can_insert: true,
      is_exhausted: false,
      min_occurs: 1,
      max_occurs: 3,
      children: [makeNode({ name: 'child1' }), makeNode({ name: 'child2' })],
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('insert-action'), 'compositor row should have Insert button');
    assert.ok(
      html.includes("insertElement('child1'"),
      'Insert button should use first element name',
    );
  });

  it('compositor with can_insert=false does NOT show Insert button', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      can_insert: false,
      is_exhausted: false,
      min_occurs: 1,
      max_occurs: 1,
      children: [makeNode({ name: 'child1' })],
    });
    const state: RowBuilderState = { rowIndex: 0 };
    // Only look at the first row (compositor itself), not children
    const html = buildContentModelRows(node, 0, state);
    const seqRow = html.split('\n').find((l) => l.includes('data-node-type="sequence"'));
    assert.ok(seqRow, 'should have a sequence row');
    assert.ok(!seqRow.includes('insert-action'), 'compositor row should NOT have Insert button');
  });

  it('compositor with is_exhausted=true does NOT show Insert button on compositor row', () => {
    const node = makeNode({
      name: '',
      node_type: 'choice',
      can_insert: true,
      is_exhausted: true,
      min_occurs: 1,
      max_occurs: 1,
      children: [makeNode({ name: 'optA' }), makeNode({ name: 'optB' })],
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    const choiceRow = html.split('\n').find((l) => l.includes('data-node-type="choice"'));
    assert.ok(choiceRow, 'should have a choice row');
    assert.ok(
      !choiceRow.includes('insert-action'),
      'exhausted compositor row should NOT have Insert button',
    );
  });

  it('element nodes still get their insert buttons (regression guard)', () => {
    const node = makeNode({
      name: 'myElement',
      node_type: 'element',
      can_insert: true,
      is_exhausted: false,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('insert-action'), 'element should still have Insert button');
    assert.ok(html.includes("insertElement('myElement'"), 'element Insert should use its own name');
  });
});

describe('buildContentModelRows - compositor cardinality badges', () => {
  it('required sequence shows 1..1 (required) cardinality chip', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      min_occurs: 1,
      max_occurs: 1,
      children: [makeNode({ name: 'child1' })],
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('cardinality-chip'), 'sequence should have cardinality chip');
    assert.ok(html.includes('1..1'), 'chip should show 1..1');
    assert.ok(html.includes('required'), 'chip should indicate required');
  });

  it('optional choice shows 0..1 cardinality chip', () => {
    const node = makeNode({
      name: '',
      node_type: 'choice',
      min_occurs: 0,
      max_occurs: 1,
      children: [makeNode({ name: 'optA' }), makeNode({ name: 'optB' })],
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('cardinality-chip'), 'choice should have cardinality chip');
    assert.ok(html.includes('0..1'), 'chip should show 0..1');
  });

  it('unbounded sequence shows infinity symbol in cardinality chip', () => {
    const node = makeNode({
      name: '',
      node_type: 'sequence',
      min_occurs: 1,
      max_occurs: 'unbounded' as unknown as number,
      current_count: 2,
      children: [makeNode({ name: 'item' })],
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(html.includes('cardinality-chip'), 'sequence should have cardinality chip');
    assert.ok(html.includes('\u221E'), 'chip should contain infinity symbol');
  });

  it('non-compositor element with 1..1 does NOT show cardinality chip', () => {
    const node = makeNode({
      name: 'myElement',
      node_type: 'element',
      min_occurs: 1,
      max_occurs: 1,
    });
    const state: RowBuilderState = { rowIndex: 0 };
    const html = buildContentModelRows(node, 0, state);
    assert.ok(!html.includes('cardinality-chip'), 'element 1..1 should NOT have cardinality chip');
  });
});
