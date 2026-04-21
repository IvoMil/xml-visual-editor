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

suite('GridRenderer — ARIA attributes', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  // ── 1. Root container has role="tree" ──────────────────────────────────

  test('grid-root has role="tree"', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData(), 3);
    const html = renderer.render(model);
    assert.ok(
      html.includes('<div class="grid-root" role="tree"'),
      'grid-root should have role="tree"',
    );
  });

  // ── 2. Tree element rows have role="treeitem" ──────────────────────────

  test('tree element row has role="treeitem"', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ nodeId: '/root[1]' }), 3);
    const html = renderer.render(model);
    const rootRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]"[^>]*/,
    );
    assert.ok(rootRow, 'Should find root r-tree row');
    assert.ok(rootRow![0].includes('role="treeitem"'), 'Tree element row should have role="treeitem"');
  });

  test('nested tree element rows have role="treeitem"', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]',
            name: 'a',
            children: [makeNodeData({ nodeId: '/root[1]/a[1]/b[1]', name: 'b' })],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    const aRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]\/a\[1\]"[^>]*/,
    );
    assert.ok(aRow, 'Should find child r-tree row');
    assert.ok(aRow![0].includes('role="treeitem"'), 'Child tree row should have role="treeitem"');
  });

  // ── 3. aria-level matches depth + 1 ───────────────────────────────────

  test('root element has aria-level="1" (depth 0 + 1)', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData(), 3);
    const html = renderer.render(model);
    const rootRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]"[^>]*/,
    );
    assert.ok(rootRow, 'Should find root row');
    assert.ok(rootRow![0].includes('aria-level="1"'), 'Root should have aria-level="1"');
  });

  test('depth-1 element has aria-level="2"', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/child[1]',
            name: 'child',
            children: [makeNodeData({ nodeId: '/root[1]/child[1]/leaf[1]', name: 'leaf' })],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    const childRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]\/child\[1\]"[^>]*/,
    );
    assert.ok(childRow, 'Should find child row');
    assert.ok(childRow![0].includes('aria-level="2"'), 'Depth-1 element should have aria-level="2"');
  });

  test('depth-2 element has aria-level="3"', () => {
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
    const bRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]\/a\[1\]\/b\[1\]"[^>]*/,
    );
    assert.ok(bRow, 'Should find depth-2 row');
    assert.ok(bRow![0].includes('aria-level="3"'), 'Depth-2 element should have aria-level="3"');
  });

  // ── 4. aria-expanded on nodes with children ────────────────────────────

  test('expanded node with children has aria-expanded="true"', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    const rootRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]"[^>]*/,
    );
    assert.ok(rootRow, 'Should find root row');
    assert.ok(
      rootRow![0].includes('aria-expanded="true"'),
      'Expanded node with children should have aria-expanded="true"',
    );
  });

  test('collapsed node with children has aria-expanded="false"', () => {
    const model = new GridModel();
    // 4 levels deep so depth-3 node is collapsed with default expandDepth=3
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
                children: [
                  makeNodeData({
                    nodeId: '/root[1]/a[1]/b[1]/deep[1]',
                    name: 'deep',
                    children: [
                      makeNodeData({ nodeId: '/root[1]/a[1]/b[1]/deep[1]/x[1]', name: 'x' }),
                    ],
                    childCount: 1,
                  }),
                ],
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
    const deepRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]\/a\[1\]\/b\[1\]\/deep\[1\]"[^>]*/,
    );
    assert.ok(deepRow, 'Should find collapsed deep node row');
    assert.ok(
      deepRow![0].includes('aria-expanded="false"'),
      'Collapsed node with children should have aria-expanded="false"',
    );
  });

  test('leaf node does not have aria-expanded attribute', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ nodeId: '/root[1]' }), 3);
    const html = renderer.render(model);
    const rootRow = html.match(
      /<div class="g-row r-tree(?:\s[^"]*)?"[^>]*data-node-id="\/root\[1\]"[^>]*/,
    );
    assert.ok(rootRow, 'Should find root row');
    assert.ok(
      !rootRow![0].includes('aria-expanded'),
      'Leaf node should NOT have aria-expanded attribute',
    );
  });

  // ── 5. Attribute rows do not have treeitem role ────────────────────────

  test('attribute rows do not have role="treeitem"', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        attributes: [{ name: 'id', value: '1' }],
      }),
     3);
    const html = renderer.render(model);
    const attrRow = html.match(/<div class="g-row r-attr(?:\s[^"]*)?"[^>]*/);
    assert.ok(attrRow, 'Should find attribute row');
    assert.ok(
      !attrRow![0].includes('role="treeitem"'),
      'Attribute row should NOT have role="treeitem"',
    );
  });
});
