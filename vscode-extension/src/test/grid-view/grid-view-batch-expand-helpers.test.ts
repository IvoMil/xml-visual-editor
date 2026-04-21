import { strict as assert } from 'assert';
import {
  computeIdDelta,
  pickInnermostExpanded,
  RowDepthEntry,
} from '../../grid-view/scripts/batch-expand-helpers';

/**
 * Pure unit tests for the batch-expand helper primitives:
 *   - computeIdDelta — computes the set of renderable ids newly added
 *     after an expand, preserving DOM order.
 *   - pickInnermostExpanded — given a multi-select set with nested
 *     expanded rows, returns only the innermost leaves so that a
 *     single `-` collapses one depth level at a time.
 */

suite('computeIdDelta — renderable-id delta for selection growth', () => {
  test('empty before → every after id is new', () => {
    assert.deepEqual(computeIdDelta([], ['A', 'B', 'C']), ['A', 'B', 'C']);
  });

  test('identical before/after → empty delta', () => {
    assert.deepEqual(computeIdDelta(['A', 'B'], ['A', 'B']), []);
  });

  test('delta preserves DOM order of the "after" list', () => {
    // Expanding a parent reveals attributes and children in
    // DOM order. The delta MUST keep that order so the growth pass adds
    // ids in the same order the user would see them scrolling.
    const before = ['/root[1]', '/root[1]/nodes[1]'];
    const after = [
      '/root[1]',
      '/root[1]/nodes[1]',
      '/root[1]/nodes[1]/@id',      // attribute
      '/root[1]/nodes[1]/@name',    // attribute
      '/root[1]/nodes[1]/child[1]#group', // #group header
      '/root[1]/nodes[1]/child[1]', // table row
      '/root[1]/nodes[1]/child[2]', // table row
    ];
    const delta = computeIdDelta(before, after);
    assert.deepEqual(delta, [
      '/root[1]/nodes[1]/@id',
      '/root[1]/nodes[1]/@name',
      '/root[1]/nodes[1]/child[1]#group',
      '/root[1]/nodes[1]/child[1]',
      '/root[1]/nodes[1]/child[2]',
    ]);
  });

  test('ids removed from after (collapse) are NOT in the delta', () => {
    // Delta is new-only: a collapse never grows, so removed ids are
    // irrelevant here (growth pass runs on `+` only).
    assert.deepEqual(computeIdDelta(['A', 'B', 'C'], ['A']), []);
  });

  test('duplicated id in after yields a single new entry', () => {
    const delta = computeIdDelta(['A'], ['A', 'B', 'B']);
    // Duplicates in after are possible under DOM rebuilds only if the
    // engine emits duplicates (it does not), but guard the invariant.
    assert.deepEqual(delta, ['B', 'B']);
  });
});

suite('pickInnermostExpanded — innermost-first collapse target', () => {
  test('single expanded root → returns that root', () => {
    const ordered: RowDepthEntry[] = [{ id: 'A', depth: 0, isExpanded: true }];
    assert.deepEqual(pickInnermostExpanded(ordered, ['A']), ['A']);
  });

  test('ancestor + descendant both expanded → returns descendant only', () => {
    // DOM order: A(d=0), B(d=1), C(d=2). All three expanded + selected.
    const ordered: RowDepthEntry[] = [
      { id: 'A', depth: 0, isExpanded: true },
      { id: 'B', depth: 1, isExpanded: true },
      { id: 'C', depth: 2, isExpanded: true },
    ];
    assert.deepEqual(pickInnermostExpanded(ordered, ['A', 'B', 'C']), ['C']);
  });

  test('two unrelated expanded subtrees → both innermost leaves returned', () => {
    const ordered: RowDepthEntry[] = [
      { id: 'A', depth: 0, isExpanded: true },
      { id: 'A/x', depth: 1, isExpanded: true },
      { id: 'B', depth: 0, isExpanded: true },
      { id: 'B/y', depth: 1, isExpanded: true },
    ];
    const got = pickInnermostExpanded(ordered, ['A', 'A/x', 'B', 'B/y']).sort();
    assert.deepEqual(got, ['A/x', 'B/y']);
  });

  test('three-level drill-down: `-` collapses only the deepest level', () => {
    const ordered: RowDepthEntry[] = [
      { id: 'L1', depth: 0, isExpanded: true },
      { id: 'L2', depth: 1, isExpanded: true },
      { id: 'L3', depth: 2, isExpanded: true },
    ];
    assert.deepEqual(pickInnermostExpanded(ordered, ['L1', 'L2', 'L3']), ['L3']);
  });

  test('empty selection → empty result', () => {
    assert.deepEqual(pickInnermostExpanded([], []), []);
  });

  test('ancestor expanded, descendant NOT in selection → returns deepest expanded descendant across the full DOM subtree', () => {
    // Per-branch deepest-expanded walk considers ALL expanded
    // rows in the DOM, not only those in the selection. So even though
    // `A/x` is not selected, `-` still collapses it first because it is
    // the deepest expanded descendant of selection root `A`.
    const ordered: RowDepthEntry[] = [
      { id: 'A', depth: 0, isExpanded: true },
      { id: 'A/x', depth: 1, isExpanded: true },
    ];
    assert.deepEqual(pickInnermostExpanded(ordered, ['A']), ['A/x']);
  });

  test('innermost-per-root: picks the deepest expanded node per independent branch when selection spans multiple subtrees', () => {
    // Two selection roots at depth 0: `groupA` expanded two levels
    // (groupA → child → gc), `groupC` expanded one level. Single `-`
    // press must collapse one level per branch INDEPENDENTLY — i.e.
    // groupA/child (depth 1) for the groupA branch AND groupC itself
    // (its own depth 0) for the groupC branch. NEVER both branches'
    // roots collapsing in the same keystroke.
    const ordered: RowDepthEntry[] = [
      { id: 'groupA', depth: 0, isExpanded: true },
      { id: 'groupA/child', depth: 1, isExpanded: true },
      { id: 'groupA/child/gc', depth: 2, isExpanded: false },
      { id: 'groupB', depth: 0, isExpanded: false },
      { id: 'groupC', depth: 0, isExpanded: true },
      { id: 'groupC/leaf', depth: 1, isExpanded: false },
    ];
    // Selection = {groupA, groupC} only. Fix forces per-root walk.
    const got = pickInnermostExpanded(ordered, ['groupA', 'groupC']).sort();
    assert.deepEqual(got, ['groupA/child', 'groupC']);
  });

  test('selection root with no expanded descendants collapses the root itself on -', () => {
    const ordered: RowDepthEntry[] = [
      { id: 'R', depth: 0, isExpanded: true },
      { id: 'R/a', depth: 1, isExpanded: false },
      { id: 'R/b', depth: 1, isExpanded: false },
    ];
    assert.deepEqual(pickInnermostExpanded(ordered, ['R']), ['R']);
  });

  test('multiple expanded descendants at equal maximum depth are all included as collapse targets', () => {
    const ordered: RowDepthEntry[] = [
      { id: 'R', depth: 0, isExpanded: true },
      { id: 'R/a', depth: 1, isExpanded: true },
      { id: 'R/b', depth: 1, isExpanded: true },
    ];
    const got = pickInnermostExpanded(ordered, ['R']).sort();
    assert.deepEqual(got, ['R/a', 'R/b']);
  });
});

suite('pickInnermostExpanded — synthesized #group table-region root handling', () => {
  /** Build a fixture mirroring the `emit-table-region.ts` contract:
   *  a `#group` header at depth D, followed by N `.r-trow` data rows at
   *  the SAME depth D. Optionally one r-trow carries an expanded
   *  cell-toggle for an element-in-one-cell child (`meta`) at logical
   *  depth D+1. The `#group` header itself carries isExpanded=true
   *  (the group is open, otherwise there would be no r-trow rows). */
  function buildGroupFixture(options: {
    groupDepth: number;
    rowCount: number;
    metaExpandedOnRow?: number; // 1-based index of the r-trow carrying meta
    trailingSibling?: { id: string; depth: number; isExpanded?: boolean };
  }): RowDepthEntry[] {
    const d = options.groupDepth;
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    const rows: RowDepthEntry[] = [
      { id: groupId, depth: d, isExpanded: true, isTableRow: false },
    ];
    for (let i = 1; i <= options.rowCount; i++) {
      const rowId = `/root[1]/groupA[1]/item[${i}]`;
      const cellChevrons =
        options.metaExpandedOnRow === i
          ? [{ childId: `${rowId}/meta`, isExpanded: true }]
          : undefined;
      rows.push({
        id: rowId,
        depth: d,
        // An r-trow with a cell-toggle expanded reports isExpanded=true
        // via the DOM's any-descendant `.expand-toggle` fallback. We
        // keep the same invariant here so the fixture matches reality.
        isExpanded: options.metaExpandedOnRow === i,
        isTableRow: true,
        cellChevrons,
      });
    }
    if (options.trailingSibling) {
      rows.push({
        id: options.trailingSibling.id,
        depth: options.trailingSibling.depth,
        isExpanded: !!options.trailingSibling.isExpanded,
        isTableRow: false,
      });
    }
    return rows;
  }

  test('#group with expanded cell-subtree: returns the inner cell child rather than the #group header itself', () => {
    // `item[3]` has its `meta` element-in-one-cell expanded. First `-`
    // press must collapse `meta`, not the whole table.
    const ordered = buildGroupFixture({
      groupDepth: 2,
      rowCount: 4,
      metaExpandedOnRow: 3,
    });
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    const got = pickInnermostExpanded(ordered, [groupId]);
    assert.deepEqual(got, ['/root[1]/groupA[1]/item[3]/meta']);
  });

  test('#group with no expanded cell-subtrees: falls back to returning the #group header as the collapse target', () => {
    const ordered = buildGroupFixture({ groupDepth: 2, rowCount: 4 });
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    assert.deepEqual(pickInnermostExpanded(ordered, [groupId]), [groupId]);
  });

  test('#group boundary stops at the first non-r-trow sibling row at the same depth', () => {
    // A sibling element after the table at the same depth must NOT be
    // treated as a descendant of the #group: collapse falls back to
    // the #group itself when no inner expansion exists.
    const ordered = buildGroupFixture({
      groupDepth: 2,
      rowCount: 2,
      trailingSibling: { id: '/root[1]/groupA[1]/sibling[1]', depth: 2, isExpanded: true },
    });
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    assert.deepEqual(pickInnermostExpanded(ordered, [groupId]), [groupId]);
  });

  test('mixed selection of ordinary expanded element and #group-with-expanded-cell returns one collapse frontier per independent branch', () => {
    // Branch 1 (ordinary): `elem` expanded with `elem/child` expanded
    // below at depth+1 → collapse `elem/child` first.
    // Branch 2 (#group): `item[2]` has `meta` cell expanded →
    // collapse `item[2]/meta` first.
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    const ordered: RowDepthEntry[] = [
      { id: '/root[1]/elem', depth: 0, isExpanded: true, isTableRow: false },
      { id: '/root[1]/elem/child', depth: 1, isExpanded: true, isTableRow: false },
      { id: '/root[1]/elem/child/gc', depth: 2, isExpanded: false, isTableRow: false },
      { id: groupId, depth: 0, isExpanded: true, isTableRow: false },
      { id: '/root[1]/groupA[1]/item[1]', depth: 0, isExpanded: false, isTableRow: true },
      {
        id: '/root[1]/groupA[1]/item[2]',
        depth: 0,
        isExpanded: true,
        isTableRow: true,
        cellChevrons: [{ childId: '/root[1]/groupA[1]/item[2]/meta', isExpanded: true }],
      },
    ];
    const got = pickInnermostExpanded(ordered, ['/root[1]/elem', groupId]).sort();
    assert.deepEqual(got, [
      '/root[1]/elem/child',
      '/root[1]/groupA[1]/item[2]/meta',
    ]);
  });

  test('#group boundary extends to cover all r-trow rows including when they run to the end of the DOM', () => {
    // No trailing siblings; subtree span must run to end of the ordered
    // list, picking up the cell-expanded row in the final r-trow.
    const ordered = buildGroupFixture({
      groupDepth: 0,
      rowCount: 3,
      metaExpandedOnRow: 3,
    });
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    assert.deepEqual(
      pickInnermostExpanded(ordered, [groupId]),
      ['/root[1]/groupA[1]/item[3]/meta'],
    );
  });
});
