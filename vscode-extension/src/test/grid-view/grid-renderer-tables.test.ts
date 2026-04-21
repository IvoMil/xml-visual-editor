import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { GridTreeNodeData } from '../../grid-view/grid-view-types';

function makeNodeData(overrides: Partial<GridTreeNodeData> = {}): GridTreeNodeData {
  return {
    nodeId: '/root[1]',
    name: 'root',
    type: 'element',
    value: '',
    line: 0,
    column: 0,
    childCount: 0,
    isTableCandidate: false,
    siblingIndex: 1,
    siblingCount: 1,
    attributes: [],
    children: [],
    ...overrides,
  };
}

/** Build a table-candidate parent with N repeated children */
function makeTableParent(
  childOverrides: Partial<GridTreeNodeData> = {},
): GridTreeNodeData {
  return makeNodeData({
    isTableCandidate: true,
    childCount: 2,
    children: [
      makeNodeData({
        nodeId: '/root[1]/item[1]',
        name: 'item',
        siblingCount: 2,
        siblingIndex: 1,
        ...childOverrides,
      }),
      makeNodeData({
        nodeId: '/root[1]/item[2]',
        name: 'item',
        siblingCount: 2,
        siblingIndex: 2,
        ...childOverrides,
      }),
    ],
  });
}

suite('GridRenderer — table region structure', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  // ── 1. Table region label + table region row produced for repeated children ──

  test('repeated children produce r-tregion-label followed by r-tregion when expanded', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    const labelIdx = html.indexOf('r-tregion-label');
    const trowIdx = html.indexOf('r-trow');
    assert.ok(labelIdx !== -1, 'Should have r-tregion-label row');
    assert.ok(trowIdx !== -1, 'Should have r-trow (table row) after label');
    assert.ok(labelIdx < trowIdx, 'r-tregion-label should appear before table rows');
  });

  test('collapsed repeated children produce only r-tregion-label, no r-tregion content', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    const html = renderer.render(model);

    assert.ok(html.includes('r-tregion-label'), 'Should have r-tregion-label');
    assert.ok(!html.includes('t-header'), 'Should NOT have t-header when collapsed');
    assert.ok(!html.includes('t-rowid'), 'Should NOT have t-rowid when collapsed');
  });

  // ── 2. r-tregion row contains t-region sub-grid with header and data rows ──

  test('expanded table has t-header and data rows as g-row r-trow in root grid', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    // No t-region sub-container in multi-column model
    assert.ok(!html.includes('t-region'), 'Should NOT have t-region sub-container (multi-column grid)');
    assert.ok(html.includes('t-header'), 'Should have t-header row');
    assert.ok(html.includes('t-rowid'), 'Should have t-rowid cells');

    // Data rows are g-row r-trow with data-node-id
    const dataRows = html.match(/class="g-row r-trow d-\d+"[^>]*data-node-id/g) || [];
    assert.strictEqual(dataRows.length, 2, 'Should have 2 data rows (one per repeated child)');
  });

  test('t-header contains column headers for element children', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    assert.ok(html.includes('elem-col-header'), 'Should have element column header');
    assert.ok(html.includes('val'), 'Header should contain element name "val"');
  });

  test('t-header contains column headers for attributes', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        attributes: [{ name: 'id', value: '1' }],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    assert.ok(html.includes('attr-col-header'), 'Should have attribute column header');
    assert.ok(html.includes('= id'), 'Header should contain "= id"');
  });

  // ── 3. Data rows have data-node-id matching original node IDs ──────────

  test('data rows have data-node-id matching original node IDs', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    assert.ok(
      html.includes('data-node-id="/root[1]/item[1]"'),
      'First data row should have data-node-id="/root[1]/item[1]"',
    );
    assert.ok(
      html.includes('data-node-id="/root[1]/item[2]"'),
      'Second data row should have data-node-id="/root[1]/item[2]"',
    );
  });

  test('data row node IDs do not contain #group suffix', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    const dataRowMatches = html.match(/class="g-row r-trow d-\d+"[^>]*data-node-id="([^"]+)"/g) || [];
    assert.ok(dataRowMatches.length > 0, 'Should find data rows');
    for (const match of dataRowMatches) {
      assert.ok(!match.includes('#group'), `Data row should not contain #group: ${match}`);
    }
  });

  // ── 4. Expandable attribute-only cells use cell-nv (not cell-nv-grid) ──

  test('expandable attribute-only cells emit cell-nv when expanded, not cell-nv-grid', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 1,
            childCount: 1,
            children: [
              makeNodeData({
                nodeId: '/root[1]/item[1]/ref[1]',
                name: 'ref',
                attributes: [
                  { name: 'href', value: 'http://example.com' },
                  { name: 'type', value: 'ext' },
                ],
              }),
            ],
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
            childCount: 1,
            children: [
              makeNodeData({
                nodeId: '/root[1]/item[2]/ref[1]',
                name: 'ref',
                attributes: [{ name: 'href', value: 'http://other.com' }],
              }),
            ],
          }),
        ],
      }),
     3);
    // Expand table region
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    // Expand the attribute-only child cell
    model.findNode('/root[1]/item[1]/ref[1]')!.toggleExpanded();
    const html = renderer.render(model);

    assert.ok(html.includes('class="cell-nv"'), 'Should emit cell-nv class');
    assert.ok(!html.includes('cell-nv-grid'), 'Should NOT emit legacy cell-nv-grid class');
    assert.ok(html.includes('cell-nv-name'), 'Should have cell-nv-name for attribute names');
    assert.ok(html.includes('cell-nv-value'), 'Should have cell-nv-value for attribute values');
  });

  test('collapsed attribute-only cells show cell-attr-summary, not cell-nv', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]/ref[1]',
            name: 'ref',
            attributes: [{ name: 'href', value: 'link' }],
          }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    assert.ok(html.includes('cell-attr-summary'), 'Should show cell-attr-summary when collapsed');
    assert.ok(!html.includes('class="cell-nv"'), 'Should NOT show cell-nv when collapsed');
  });

  // ── 5. Table region row structure ──────────────────────────────────────

  test('table cells use inline grid-column for root grid placement', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    // Table cells have inline grid-column styles (range format: N / M)
    assert.ok(/style="grid-column: \d+ \/ \d+;"/.test(html), 'Table cells should have inline grid-column');
    // Indent cells exist (one per grid line left of the `#` column). The
    // global-grid model uses per-column indent cells instead of a single
    // filler, so every row has depth+1 indent cells at columns 1..(D+1).
    assert.ok(html.includes('g-indent'), 'Should have g-indent indent cells');
  });

  test('root grid-template-columns uses repeat(N, max-content) 1fr', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    const match = html.match(/grid-template-columns:\s*repeat\((\d+),\s*max-content\)\s*1fr/);
    assert.ok(match, 'Root grid should have repeat(N, max-content) 1fr');
    const totalCols = parseInt(match![1], 10);
    assert.ok(totalCols >= 1, `totalCols should be >= 1, got ${totalCols}`);
  });

  test('each table row contains leading g-indent cells for global grid alignment', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [
          makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    // Group label is emitted at child-depth D = 1, so each of the 3 rows
    // (1 header + 2 data) contributes D+1 = 2 indent cells for a total of 6.
    const indentCount = (html.match(/class="g-indent"/g) || []).length;
    assert.ok(
      indentCount >= 6,
      `Should have ≥ 6 g-indent cells across table header + 2 data rows, got ${indentCount}`,
    );
  });

  // ── 6. Multiple table groups in same parent ────────────────────────────

  test('parent with two groups of repeated children produces two r-tregion-label rows', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 4,
        children: [
          makeNodeData({
            nodeId: '/root[1]/alpha[1]',
            name: 'alpha',
            siblingCount: 2,
            siblingIndex: 1,
          }),
          makeNodeData({
            nodeId: '/root[1]/alpha[2]',
            name: 'alpha',
            siblingCount: 2,
            siblingIndex: 2,
          }),
          makeNodeData({
            nodeId: '/root[1]/beta[1]',
            name: 'beta',
            siblingCount: 2,
            siblingIndex: 1,
          }),
          makeNodeData({
            nodeId: '/root[1]/beta[2]',
            name: 'beta',
            siblingCount: 2,
            siblingIndex: 2,
          }),
        ],
      }),
     3);
    const html = renderer.render(model);
    const labels = html.match(/r-tregion-label/g) || [];
    assert.strictEqual(labels.length, 2, 'Should have 2 r-tregion-label rows (alpha + beta)');
    assert.ok(html.includes('alpha'), 'Should contain group name alpha');
    assert.ok(html.includes('beta'), 'Should contain group name beta');
  });
});
