import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
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

suite('GridModel', () => {
  test('getRoot returns null initially', () => {
    const model = new GridModel();
    assert.strictEqual(model.getRoot(), null);
  });

  test('setTreeData sets root and getRoot returns it', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ name: 'config' }), 3);
    const root = model.getRoot();
    assert.notStrictEqual(root, null);
    assert.strictEqual(root!.name, 'config');
    assert.ok(root instanceof GridNode);
  });

  test('findNode finds root node by ID', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ nodeId: '/root[1]' }), 3);
    const found = model.findNode('/root[1]');
    assert.notStrictEqual(found, null);
    assert.strictEqual(found!.nodeId, '/root[1]');
  });

  test('findNode finds nested node by ID', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const found = model.findNode('/root[1]/child[1]');
    assert.notStrictEqual(found, null);
    assert.strictEqual(found!.name, 'child');
  });

  test('findNode finds deep node by ID', () => {
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
    const found = model.findNode('/root[1]/a[1]/b[1]/c[1]');
    assert.notStrictEqual(found, null);
    assert.strictEqual(found!.name, 'c');
  });

  test('findNode returns null for non-existent ID', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData(), 3);
    assert.strictEqual(model.findNode('/nonexistent'), null);
  });

  test('findNode returns null when model is empty', () => {
    const model = new GridModel();
    assert.strictEqual(model.findNode('/root[1]'), null);
  });

  test('clear sets getRoot to null', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData(), 3);
    assert.notStrictEqual(model.getRoot(), null);
    model.clear();
    assert.strictEqual(model.getRoot(), null);
  });

  test('setTreeData replaces the old tree', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ name: 'first' }), 3);
    assert.strictEqual(model.getRoot()!.name, 'first');
    model.setTreeData(makeNodeData({ name: 'second' }), 3);
    assert.strictEqual(model.getRoot()!.name, 'second');
  });

  test('toggleExpanded via findNode changes node state', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/child[1]',
            name: 'child',
            children: [makeNodeData({ nodeId: '/root[1]/child[1]/sub[1]', name: 'sub' })],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const node = model.findNode('/root[1]/child[1]');
    assert.notStrictEqual(node, null);
    assert.strictEqual(node!.isExpanded, true);
    node!.toggleExpanded();
    assert.strictEqual(node!.isExpanded, false);
    // Verify the same node is returned on subsequent find
    const sameNode = model.findNode('/root[1]/child[1]');
    assert.strictEqual(sameNode!.isExpanded, false);
  });
});
