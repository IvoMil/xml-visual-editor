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

/** Helper: build a table-candidate parent with 2 repeated children */
function makeTableParent(childOverrides: Partial<GridTreeNodeData> = {}): GridTreeNodeData {
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

suite('GridRenderer — expand/collapse state', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  // ── 1. Table regions start collapsed with expand-toggle chevron ─────────

  test('r-tregion-label has expand-toggle (not expand-spacer)', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    const html = renderer.render(model);
    // Extract the r-tregion-label portion
    const labelIdx = html.indexOf('r-tregion-label');
    assert.ok(labelIdx !== -1, 'Should have r-tregion-label');
    const labelSection = html.substring(labelIdx, labelIdx + 300);
    assert.ok(labelSection.includes('expand-toggle'), 'Label should contain expand-toggle');
    assert.ok(!labelSection.includes('expand-spacer'), 'Label should NOT contain expand-spacer');
  });

  test('r-tregion-label expand-toggle starts collapsed (data-expanded="false")', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    const html = renderer.render(model);
    const labelIdx = html.indexOf('r-tregion-label');
    const labelSection = html.substring(labelIdx, labelIdx + 400);
    assert.ok(
      labelSection.includes('data-expanded="false"'),
      'expand-toggle should have data-expanded="false" initially',
    );
  });

  test('collapsed r-tregion-label chevron is ▶', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    const html = renderer.render(model);
    const labelIdx = html.indexOf('r-tregion-label');
    const labelSection = html.substring(labelIdx, labelIdx + 400);
    assert.ok(labelSection.includes('\u25b6'), 'Collapsed chevron should be ▶');
    assert.ok(!labelSection.includes('\u25bc'), 'Should NOT have expanded chevron ▼');
  });

  test('collapsed table region does NOT render table content', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    const html = renderer.render(model);
    assert.ok(!html.includes('t-header'), 'No t-header when table region is collapsed');
  });

  test('expanded table region shows data-expanded="true", ▼ chevron, and table content', () => {
    const model = new GridModel();
    model.setTreeData(
      makeTableParent({
        childCount: 1,
        children: [makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'X' })],
      }),
     3);
    // Expand the first node to open the table region
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    const labelIdx = html.indexOf('r-tregion-label');
    const labelSection = html.substring(labelIdx, labelIdx + 400);
    assert.ok(
      labelSection.includes('data-expanded="true"'),
      'Should have data-expanded="true" after expanding',
    );
    assert.ok(labelSection.includes('\u25bc'), 'Expanded chevron should be ▼');
    assert.ok(html.includes('t-header'), 'Should render t-header when expanded');
  });

  // ── 2. Table-region-label has unique #group node ID ──────────────────────

  test('r-tregion-label data-node-id ends with #group', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    const html = renderer.render(model);
    assert.ok(
      html.includes('data-node-id="/root[1]/item[1]#group"'),
      'r-tregion-label should have nodeId with #group suffix',
    );
  });

  test('expand-toggle within r-tregion-label has #group suffixed ID', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    const html = renderer.render(model);
    // Extract the r-tregion-label section, then find the expand-toggle within it
    const labelStart = html.indexOf('r-tregion-label');
    assert.ok(labelStart !== -1, 'Should have r-tregion-label');
    const labelSection = html.substring(labelStart, labelStart + 500);
    const toggleMatch = labelSection.match(/expand-toggle[^>]*data-node-id="([^"]+)"/);
    assert.ok(toggleMatch, 'Should find expand-toggle within label');
    assert.ok(
      toggleMatch[1].endsWith('#group'),
      `expand-toggle data-node-id should end with #group, got: ${toggleMatch[1]}`,
    );
  });

  test('table data row uses original nodeId without #group suffix', () => {
    const model = new GridModel();
    model.setTreeData(makeTableParent(), 3);
    // Expand to render the table rows
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    // Find the t-row data-node-id (not the t-header which has no data-node-id)
    const rowMatch = html.match(/class="g-row r-trow d-\d+"[^>]*data-node-id="([^"]+)"/);
    assert.ok(rowMatch, 'Should find r-trow with data-node-id');
    assert.strictEqual(
      rowMatch[1],
      '/root[1]/item[1]',
      'r-trow should have original nodeId without #group',
    );
    assert.ok(!rowMatch[1].includes('#group'), 'r-trow nodeId must NOT contain #group');
  });

  // ── 3. Attribute-only elements in table cells are expandable ─────────────

  test('attribute-only child in table cell has cell-toggle (collapsed by default)', () => {
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
                  { name: 'href', value: 'link1' },
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
                attributes: [{ name: 'href', value: 'link2' }],
              }),
            ],
          }),
        ],
      }),
     3);
    // Expand table region
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    assert.ok(html.includes('cell-toggle'), 'Should have cell-toggle class');
    assert.ok(html.includes('cell-elem-name'), 'Should have cell-elem-name');
    assert.ok(html.includes('cell-attr-summary'), 'Should have cell-attr-summary (collapsed)');
    // Check collapsed state
    const cellToggleMatch = html.match(/cell-toggle[^>]*data-expanded="([^"]+)"/);
    assert.ok(cellToggleMatch, 'Should find cell-toggle with data-expanded');
    assert.strictEqual(cellToggleMatch[1], 'false', 'Cell toggle should be collapsed by default');
  });

  test('collapsed attribute-only cell shows chevron ▶ and attribute summary', () => {
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
                attributes: [{ name: 'href', value: 'http://example.com' }],
              }),
            ],
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
          }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    // Find area around cell-toggle
    const cellIdx = html.indexOf('cell-toggle');
    assert.ok(cellIdx !== -1, 'Should have cell-toggle');
    const cellArea = html.substring(cellIdx, cellIdx + 400);
    assert.ok(cellArea.includes('\u25b6'), 'Collapsed cell should show ▶');
    assert.ok(html.includes('cell-attr-summary'), 'Should have attribute summary');
    assert.ok(html.includes('href='), 'Summary should contain attribute name');
  });

  test('expanded attribute-only cell shows cell-nv with attribute rows', () => {
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
          }),
        ],
      }),
     3);
    // Expand table region, then expand the attribute-only child
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    model.findNode('/root[1]/item[1]/ref[1]')!.toggleExpanded();
    const html = renderer.render(model);
    assert.ok(html.includes('class="cell-nv"'), 'Should render cell-nv when expanded');
    assert.ok(html.includes('cell-nv-name'), 'Should have cell-nv-name');
    assert.ok(html.includes('cell-nv-value'), 'Should have cell-nv-value');
    assert.ok(html.includes('href'), 'Should render href attribute');
    assert.ok(html.includes('http://example.com'), 'Should render href value');
    assert.ok(html.includes('type'), 'Should render type attribute');
    assert.ok(html.includes('ext'), 'Should render type value');
    // Check expanded state
    const cellToggleMatch = html.match(/cell-toggle[^>]*data-expanded="([^"]+)"/);
    assert.ok(cellToggleMatch, 'Should find cell-toggle');
    assert.strictEqual(cellToggleMatch[1], 'true', 'Cell toggle should be expanded');
    // Expanded chevron
    const cellIdx = html.indexOf('cell-toggle');
    const cellArea = html.substring(cellIdx, cellIdx + 200);
    assert.ok(cellArea.includes('\u25bc'), 'Expanded cell should show ▼');
  });

  // ── 4. Shared column boundaries via CSS depth variable ───────────────────

  test('root children rows rendered at --depth: 1', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('--depth: 1'), 'Child rows should have --depth: 1');
  });

  test('grandchild rows rendered at --depth: 2', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]',
            name: 'a',
            attributes: [{ name: 'id', value: '1' }],
            children: [makeNodeData({ nodeId: '/root[1]/a[1]/b[1]', name: 'b' })],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('--depth: 1'), 'Should have --depth: 1 at child level');
    assert.ok(html.includes('--depth: 2'), 'Grandchild rows should have --depth: 2');
  });

  test('great-grandchild rows rendered at --depth: 3', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]',
            name: 'a',
            children: [
              makeNodeData({
                nodeId: '/root[1]/a[1]/b[1]',
                name: 'b',
                attributes: [{ name: 'x', value: '1' }],
                children: [makeNodeData({ nodeId: '/root[1]/a[1]/b[1]/c[1]', name: 'c' })],
                childCount: 1,
              }),
            ],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('--depth: 3'), 'Great-grandchild rows should have --depth: 3');
  });

  test('table region rows have correct depth', () => {
    const model = new GridModel();
    // Table region renders at depth+1 from parent
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
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
          }),
        ],
      }),
     3);
    // Expand table region to render content
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    // Root at --depth: 0, table region label and content at --depth: 1
    assert.ok(html.includes('--depth: 0'), 'Should have --depth: 0 for root');
    assert.ok(html.includes('--depth: 1'), 'Should have --depth: 1 for table region rows');
    // Verify both r-tregion-label and r-tregion are rendered
    assert.ok(html.includes('r-tregion-label'), 'Should render table region label');
    assert.ok(html.includes('r-tregion'), 'Should render table region row');
  });
});
