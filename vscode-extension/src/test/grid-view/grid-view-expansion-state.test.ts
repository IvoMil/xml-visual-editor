import { strict as assert } from 'assert';
import { GridNode } from '../../grid-view/model/grid-node';
import {
  snapshotExpansionState,
  applyExpansionState,
} from '../../grid-view/grid-view-panel';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * Expansion state (isExpanded per node) survives tree rebuilds so that
 * `setTreeData` preserves the user's currently-expanded rows across tab
 * switches and live-edit reconciles.
 */

suite('expansion state — snapshot/apply round-trips isExpanded across setTreeData rebuilds', () => {
  function buildTree(): GridNode {
    return new GridNode(
      makeNodeData({
        nodeId: '/root[1]',
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]',
            childCount: 1,
            children: [makeNodeData({ nodeId: '/root[1]/a[1]/deep[1]' })],
          }),
          makeNodeData({ nodeId: '/root[1]/b[1]' }),
        ],
      }),
    );
  }

  test('snapshot captures every node\'s isExpanded state', () => {
    const root = buildTree();
    const snap = snapshotExpansionState(root);
    assert.ok(snap.has('/root[1]'));
    assert.ok(snap.has('/root[1]/a[1]'));
    assert.ok(snap.has('/root[1]/a[1]/deep[1]'));
    assert.ok(snap.has('/root[1]/b[1]'));
  });

  test('apply round-trips isExpanded across a rebuild', () => {
    const oldRoot = buildTree();
    // Mutate: collapse /root[1]/a[1], expand its deep grandchild.
    const a = oldRoot.children[0];
    a.isExpanded = false;
    const deep = a.children[0];
    deep.isExpanded = true;
    const snap = snapshotExpansionState(oldRoot);

    // Fresh tree with defaults — simulate a `setTreeData` rebuild.
    const newRoot = buildTree();
    applyExpansionState(newRoot, snap);
    assert.equal(newRoot.children[0].isExpanded, false, 'a re-collapsed');
    assert.equal(newRoot.children[0].children[0].isExpanded, true, 'deep re-expanded');
    // /root[1] keeps its prior state (expanded).
    assert.equal(newRoot.isExpanded, oldRoot.isExpanded);
  });

  test('new nodes (not in snapshot) keep default expansion from expandDepth', () => {
    const snap = new Map<string, boolean>();
    snap.set('/root[1]', true);
    // Build a fresh tree; only the root is in the snapshot — children
    // retain their default initial state.
    const newRoot = buildTree();
    const defaultChildState = newRoot.children[0].isExpanded;
    applyExpansionState(newRoot, snap);
    assert.equal(newRoot.isExpanded, true);
    assert.equal(newRoot.children[0].isExpanded, defaultChildState);
  });
});
