import { strict as assert } from 'assert';
import { topLevelSelectedNodeIds } from '../../grid-view/model/grid-selection-top-level';

/**
 * B.1.g — topLevelSelectedNodeIds helper
 * Ref: docs/designs/DESIGN_GRID_ALIGNMENT.md §9.6
 *
 * The helper drives the table-mode-OFF (⊞) icon gating: only the
 * outermost of each disjoint nested selection group receives an icon.
 */

/** Build a parent-id lookup from an explicit parent map. */
function parentLookup(parents: Record<string, string>) {
  return (id: string): string | undefined => parents[id];
}

suite('topLevelSelectedNodeIds — returns only the outermost node from each nested selection group', () => {
  test('empty selection returns empty set', () => {
    const out = topLevelSelectedNodeIds(new Set<string>(), () => undefined);
    assert.strictEqual(out.size, 0);
  });

  test('single-id selection returns that id', () => {
    const out = topLevelSelectedNodeIds(new Set(['a']), () => undefined);
    assert.deepStrictEqual(Array.from(out), ['a']);
  });

  test('parent and child both selected returns only the parent', () => {
    const parents = { parent: 'root', child: 'parent' };
    const out = topLevelSelectedNodeIds(
      new Set(['parent', 'child']),
      parentLookup(parents),
    );
    assert.deepStrictEqual(Array.from(out), ['parent']);
  });

  test('three-deep selection (A > B > C) returns only A', () => {
    const parents = { A: 'root', B: 'A', C: 'B' };
    const out = topLevelSelectedNodeIds(
      new Set(['A', 'B', 'C']),
      parentLookup(parents),
    );
    assert.deepStrictEqual(Array.from(out), ['A']);
  });

  test('disjoint subtree selections return every top-level independently', () => {
    const parents = {
      leftParent: 'root',
      leftChild: 'leftParent',
      rightParent: 'root',
      rightChild: 'rightParent',
    };
    const out = topLevelSelectedNodeIds(
      new Set(['leftParent', 'leftChild', 'rightParent', 'rightChild']),
      parentLookup(parents),
    );
    const sorted = Array.from(out).sort();
    assert.deepStrictEqual(sorted, ['leftParent', 'rightParent']);
  });

  test('non-contiguous nesting (A, C where C descends A but intermediate B is NOT selected) keeps only A', () => {
    const parents = { A: 'root', B: 'A', C: 'B' };
    const out = topLevelSelectedNodeIds(
      new Set(['A', 'C']),
      parentLookup(parents),
    );
    assert.deepStrictEqual(Array.from(out), ['A']);
  });

  test('lookup that returns undefined at the top terminates the walk', () => {
    // id "orphan" has no parent entry; must survive as top-level.
    const out = topLevelSelectedNodeIds(
      new Set(['orphan']),
      () => undefined,
    );
    assert.deepStrictEqual(Array.from(out), ['orphan']);
  });
});
