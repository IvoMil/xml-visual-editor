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

suite('GridRenderer — flat row architecture', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  // ── 1. Single grid-root container ──────────────────────────────────────

  test('render() output contains exactly one grid-root container', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData(), 3);
    const html = renderer.render(model);
    const matches = html.match(/<div class="grid-root"/g);
    assert.ok(matches, 'Should contain grid-root');
    assert.strictEqual(matches!.length, 1, 'Should have exactly one grid-root');
  });

  // ── 2. No legacy HTML table elements ───────────────────────────────────

  test('output contains no <table elements (simple tree)', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(!/<table[\s>]/i.test(html), 'Should contain no <table elements');
  });

  test('output contains no <tr or <td elements (simple tree)', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(!/<tr[\s>]/i.test(html), 'Should contain no <tr elements');
    assert.ok(!/<td[\s>]/i.test(html), 'Should contain no <td elements');
  });

  test('no <table, <tr, <td even with expanded table regions', () => {
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
              makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'A' }),
            ],
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
            childCount: 1,
            children: [
              makeNodeData({ nodeId: '/root[1]/item[2]/val[1]', name: 'val', value: 'B' }),
            ],
          }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    assert.ok(html.includes('r-trow'), 'Table rows should be rendered');
    assert.ok(!/<table[\s>]/i.test(html), 'No <table elements even with table regions');
    assert.ok(!/<tr[\s>]/i.test(html), 'No <tr elements even with table regions');
    assert.ok(!/<td[\s>]/i.test(html), 'No <td elements even with table regions');
  });

  // ── 3. All g-row elements are direct children of grid-root ─────────────

  test('all g-row divs are direct children of grid-root (div-depth check)', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 3,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 1,
            childCount: 1,
            children: [
              makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'A' }),
            ],
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
          }),
          makeNodeData({
            nodeId: '/root[1]/config[1]',
            name: 'config',
            siblingCount: 1,
            siblingIndex: 1,
            attributes: [{ name: 'id', value: '1' }],
          }),
        ],
      }),
     3);
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);

    // Track div nesting depth; every g-row should be at depth 2
    // (depth 1 = grid-root, depth 2 = direct child of grid-root)
    let divDepth = 0;
    const tagPattern = /<(\/?)div\b([^>]*)>/g;
    let match;
    let gRowCount = 0;
    while ((match = tagPattern.exec(html)) !== null) {
      if (match[1] === '/') {
        divDepth--;
      } else {
        divDepth++;
        if (match[2].includes('g-row')) {
          gRowCount++;
          assert.strictEqual(
            divDepth,
            2,
            `g-row should be at div-depth 2 (direct child of grid-root), found at ${divDepth}`,
          );
        }
      }
    }
    assert.ok(gRowCount >= 3, `Should have at least 3 g-row elements, found ${gRowCount}`);
  });

  // ── 4. Every g-row has --depth: N with non-negative integer ────────────

  test('every g-row has style="--depth: N" with non-negative integer', () => {
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
    const gRows = html.match(/<div class="g-row [^"]*"[^>]*>/g) || [];
    assert.ok(gRows.length >= 2, `Should have multiple g-row elements, found ${gRows.length}`);
    for (const row of gRows) {
      const depthMatch = row.match(/--depth:\s*(\d+)/);
      assert.ok(depthMatch, `g-row should have --depth: N, got: ${row}`);
      const depth = parseInt(depthMatch![1], 10);
      assert.ok(depth >= 0, `Depth should be non-negative, got: ${depth}`);
    }
  });

  // ── 5. Depth propagation ───────────────────────────────────────────────

  test('depth correctly propagates: element at tree-depth 3 has --depth: 3', () => {
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
    // Node c is at tree-depth 3 (root=0, a=1, b=2, c=3)
    const cRowMatch = html.match(
      /<div class="g-row[^"]*"[^>]*data-node-id="\/root\[1\]\/a\[1\]\/b\[1\]\/c\[1\]"[^>]*/,
    );
    assert.ok(cRowMatch, 'Should find g-row for node c');
    assert.ok(
      cRowMatch![0].includes('--depth: 3'),
      `Node c at tree-depth 3 should have --depth: 3, got: ${cRowMatch![0]}`,
    );
  });

  test('root element has --depth: 0', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ nodeId: '/root[1]' }), 3);
    const html = renderer.render(model);
    const rootRow = html.match(
      /<div class="g-row[^"]*"[^>]*data-node-id="\/root\[1\]"[^>]*/,
    );
    assert.ok(rootRow, 'Should find g-row for root');
    assert.ok(rootRow![0].includes('--depth: 0'), 'Root should have --depth: 0');
  });

  // ── 6. No legacy CSS classes ───────────────────────────────────────────

  test('no legacy CSS classes from old nested table architecture', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        attributes: [{ name: 'id', value: '1' }],
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(!html.includes('name-value-grid'), 'No legacy name-value-grid class');
    assert.ok(!html.includes('tree-children'), 'No legacy tree-children class');
    assert.ok(!html.includes('grid-tree'), 'No legacy grid-tree class');
    assert.ok(!html.includes('nv-nested'), 'No legacy nv-nested class');
  });
});
