import { strict as assert } from 'assert';
import { GridNode } from '../../grid-view/model/grid-node';
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

suite('GridNode', () => {
  test('constructor parses GridTreeNodeData fields correctly', () => {
    const data = makeNodeData({
      nodeId: '/config[1]',
      name: 'config',
      value: 'hello',
      line: 5,
    });
    const node = new GridNode(data);
    assert.strictEqual(node.nodeId, '/config[1]');
    assert.strictEqual(node.name, 'config');
    assert.strictEqual(node.value, 'hello');
    assert.strictEqual(node.line, 5);
  });

  test('root node is expanded when it has children (expandDepth > 0)', () => {
    const data = makeNodeData({
      children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
      childCount: 1,
    });
    const node = new GridNode(data, 2);
    assert.strictEqual(node.isExpanded, true);
  });

  test('depth-1 children are expanded, depth-2 children are collapsed (expandDepth=2)', () => {
    const data = makeNodeData({
      children: [
        makeNodeData({
          nodeId: '/root[1]/child[1]',
          name: 'child',
          children: [makeNodeData({ nodeId: '/root[1]/child[1]/sub[1]', name: 'sub' })],
          childCount: 1,
        }),
      ],
      childCount: 1,
    });
    const root = new GridNode(data, 2);
    assert.strictEqual(root.isExpanded, true);
    assert.strictEqual(root.children[0].isExpanded, true);
    assert.strictEqual(root.children[0].children[0].isExpanded, false);
  });

  test('leaf node has no children and is not expanded', () => {
    const node = new GridNode(makeNodeData());
    assert.strictEqual(node.hasChildren, false);
    assert.strictEqual(node.isExpanded, false);
  });

  test('attributes from engine data are accessible', () => {
    const data = makeNodeData({
      attributes: [
        { name: 'id', value: '42' },
        { name: 'type', value: 'config' },
      ],
    });
    const node = new GridNode(data);
    assert.strictEqual(node.attributes.length, 2);
    assert.strictEqual(node.attributes[0].name, 'id');
    assert.strictEqual(node.attributes[0].value, '42');
    assert.strictEqual(node.attributes[1].name, 'type');
    assert.strictEqual(node.hasAttributes, true);
  });

  test('hasAttributes is false when no attributes', () => {
    const node = new GridNode(makeNodeData());
    assert.strictEqual(node.hasAttributes, false);
  });

  test('toggleExpanded flips isExpanded on node with children', () => {
    const data = makeNodeData({
      children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
      childCount: 1,
    });
    const node = new GridNode(data, 2);
    assert.strictEqual(node.isExpanded, true);
    node.toggleExpanded();
    assert.strictEqual(node.isExpanded, false);
    node.toggleExpanded();
    assert.strictEqual(node.isExpanded, true);
  });

  test('toggleExpanded toggles even on a leaf node', () => {
    const node = new GridNode(makeNodeData());
    assert.strictEqual(node.isExpanded, false);
    node.toggleExpanded();
    assert.strictEqual(node.isExpanded, true);
  });

  test('nested children are created as GridNode instances', () => {
    const data = makeNodeData({
      children: [
        makeNodeData({
          nodeId: '/root[1]/a[1]',
          name: 'a',
          children: [makeNodeData({ nodeId: '/root[1]/a[1]/b[1]', name: 'b' })],
          childCount: 1,
        }),
      ],
      childCount: 1,
    });
    const root = new GridNode(data, 2);
    assert.strictEqual(root.children.length, 1);
    assert.ok(root.children[0] instanceof GridNode);
    assert.strictEqual(root.children[0].name, 'a');
    assert.strictEqual(root.children[0].children.length, 1);
    assert.ok(root.children[0].children[0] instanceof GridNode);
    assert.strictEqual(root.children[0].children[0].name, 'b');
  });

  test('childCount is preserved from engine data', () => {
    const data = makeNodeData({ childCount: 5 });
    const node = new GridNode(data);
    assert.strictEqual(node.childCount, 5);
  });

  // ── Bugfix round 3: table-candidate children start collapsed ─────────

  test('table-candidate parent has collapsed children (expandDepth=0)', () => {
    const data = makeNodeData({
      isTableCandidate: true,
      childCount: 2,
      children: [
        makeNodeData({
          nodeId: '/root[1]/item[1]',
          name: 'item',
          siblingCount: 2,
          siblingIndex: 1,
          children: [makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val' })],
          childCount: 1,
        }),
        makeNodeData({
          nodeId: '/root[1]/item[2]',
          name: 'item',
          siblingCount: 2,
          siblingIndex: 2,
        }),
      ],
    });
    const root = new GridNode(data, 3);
    assert.strictEqual(root.isExpanded, true, 'Root should be expanded');
    assert.strictEqual(
      root.children[0].isExpanded,
      false,
      'Table-candidate child should start collapsed',
    );
    assert.strictEqual(
      root.children[0].children[0].isExpanded,
      false,
      'Grandchild of table-candidate should also be collapsed',
    );
  });

  test('non-table-candidate parent has expanded children at depth < expandDepth', () => {
    const data = makeNodeData({
      isTableCandidate: false,
      childCount: 1,
      children: [
        makeNodeData({
          nodeId: '/root[1]/child[1]',
          name: 'child',
          children: [makeNodeData({ nodeId: '/root[1]/child[1]/sub[1]', name: 'sub' })],
          childCount: 1,
        }),
      ],
    });
    const root = new GridNode(data, 3);
    assert.strictEqual(root.isExpanded, true, 'Root expanded');
    assert.strictEqual(root.children[0].isExpanded, true, 'Depth-1 child expanded');
    assert.strictEqual(
      root.children[0].children[0].isExpanded,
      false,
      'Depth-2 grandchild collapsed (expandDepth exhausted)',
    );
  });

  test('toggleExpanded works on leaf nodes (guard removed)', () => {
    const node = new GridNode(makeNodeData());
    assert.strictEqual(node.hasChildren, false, 'Should be a leaf');
    assert.strictEqual(node.isExpanded, false, 'Leaf starts collapsed');
    node.toggleExpanded();
    assert.strictEqual(node.isExpanded, true, 'Leaf should toggle to expanded');
    node.toggleExpanded();
    assert.strictEqual(node.isExpanded, false, 'Leaf should toggle back to collapsed');
  });

  test('default expandDepth = 0 yields a collapsed root', () => {
    const data = makeNodeData({
      children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
      childCount: 1,
      attributes: [{ name: 'id', value: '1' }],
    });
    const node = new GridNode(data);
    assert.strictEqual(
      node.isExpanded,
      false,
      'Root must start collapsed under default expandDepth = 0',
    );
    assert.strictEqual(
      node.children[0].isExpanded,
      false,
      'Child must also be collapsed under default expandDepth = 0',
    );
    // Legacy opt-in still produces an expanded root with the same data.
    const legacy = new GridNode(data, 3);
    assert.strictEqual(legacy.isExpanded, true, 'expandDepth > 0 opt-in still expands');
  });
});
