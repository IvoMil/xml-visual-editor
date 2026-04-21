import { strict as assert } from 'assert';
import {
  partitionByTableRow,
  pickGrowthParents,
  collectCellChildIdsToFlip,
  directChildIdsOf,
  RowDepthEntry,
} from '../../grid-view/scripts/batch-expand-helpers';

/**
 * Table-row `+`/`-` expand/collapse: `+` on a row inside a table region
 * triggers the row's chevron-bearing cells to expand/collapse, leaving
 * the row in the table.
 *
 * The webview's `+`/`-` keydown handler:
 *   1. Partitions the selection into TREE ids vs TABLE-ROW ids by DOM
 *      class (`r-trow` discriminator).
 *   2. For TREE ids on `+`, snapshots which are currently collapsed
 *      → these become the "growth parents".
 *   3. For TABLE-ROW ids, walks each row's `.expand-toggle.cell-toggle`
 *      chevrons and picks the children whose state needs to flip under
 *      the direction guard.
 *   4. Posts ONE batchToggleExpand to the host with
 *      `[...treeIds, ...cellChildIds]`. Note: the table-row id itself
 *      is NEVER in the post — only the chevron-children of its cells.
 *
 * These tests cover the four pure helpers that drive that flow.
 * The DOM-bound twins inlined in grid-view-webview-script.ts mirror
 * these algorithms verbatim.
 */
suite('batch-expand-helpers — partition / pickGrowthParents / collectCellChildIds', () => {
  // ---- partitionByTableRow ----------------------------------------------

  test('Y1. selection with 1 tree + 1 table-row → partition splits correctly', () => {
    const ids = ['/root/foo', '/root/items/item[3]'];
    const isTableRow = (id: string): boolean => id === '/root/items/item[3]';
    const out = partitionByTableRow(ids, isTableRow);
    assert.deepEqual(out.treeIds, ['/root/foo']);
    assert.deepEqual(out.tableRowIds, ['/root/items/item[3]']);
  });

  test('Y2. all-tree selection → tableRowIds is empty', () => {
    const out = partitionByTableRow(['A', 'B', 'C'], () => false);
    assert.deepEqual(out.treeIds, ['A', 'B', 'C']);
    assert.deepEqual(out.tableRowIds, []);
  });

  test('Y3. all-table-row selection → treeIds is empty', () => {
    const out = partitionByTableRow(['R1', 'R2'], () => true);
    assert.deepEqual(out.treeIds, []);
    assert.deepEqual(out.tableRowIds, ['R1', 'R2']);
  });

  test('Y4. partition preserves input order within each bucket', () => {
    const ids = ['T1', 'X1', 'T2', 'X2', 'X3'];
    const tableSet = new Set(['X1', 'X2', 'X3']);
    const out = partitionByTableRow(ids, (id) => tableSet.has(id));
    assert.deepEqual(out.treeIds, ['T1', 'T2']);
    assert.deepEqual(out.tableRowIds, ['X1', 'X2', 'X3']);
  });

  // ---- collectCellChildIdsToFlip ---------------------------------------

  test('Y5. table row with 2 collapsed chevrons + `+` → both child ids flip', () => {
    const getChevrons = (rowId: string) => {
      if (rowId === 'R1') {
        return [
          { childId: 'R1/A', isExpanded: false },
          { childId: 'R1/B', isExpanded: false },
        ];
      }
      return [];
    };
    const out = collectCellChildIdsToFlip(['R1'], '+', getChevrons);
    assert.deepEqual(out, ['R1/A', 'R1/B']);
  });

  test('Y6. mixed cell states + `+` → only currently-collapsed flip', () => {
    const out = collectCellChildIdsToFlip(['R1'], '+', () => [
      { childId: 'R1/X', isExpanded: false },
      { childId: 'R1/Y', isExpanded: true },
      { childId: 'R1/Z', isExpanded: false },
    ]);
    assert.deepEqual(out, ['R1/X', 'R1/Z']);
  });

  test('Y7. mixed cell states + `-` → only currently-expanded flip', () => {
    const out = collectCellChildIdsToFlip(['R1'], '-', () => [
      { childId: 'R1/X', isExpanded: false },
      { childId: 'R1/Y', isExpanded: true },
      { childId: 'R1/Z', isExpanded: true },
    ]);
    assert.deepEqual(out, ['R1/Y', 'R1/Z']);
  });

  test('Y8. table row with no chevron cells → no-op (empty result, no error)', () => {
    const out = collectCellChildIdsToFlip(['R1'], '+', () => []);
    assert.deepEqual(out, []);
  });

  test('Y9. multiple table rows → results concatenated in input order', () => {
    const data: Record<string, Array<{ childId: string; isExpanded: boolean }>> = {
      R1: [{ childId: 'R1/A', isExpanded: false }],
      R2: [{ childId: 'R2/A', isExpanded: false }, { childId: 'R2/B', isExpanded: false }],
    };
    const out = collectCellChildIdsToFlip(['R1', 'R2'], '+', (r) => data[r] ?? []);
    assert.deepEqual(out, ['R1/A', 'R2/A', 'R2/B']);
  });

  // ---- pickGrowthParents -----------------------------------------------

  test('Y10. `+` direction → returns only currently-collapsed tree ids', () => {
    const collapsed = new Set(['A', 'C']);
    const out = pickGrowthParents(['A', 'B', 'C', 'D'], '+', (id) => collapsed.has(id));
    assert.deepEqual(out, ['A', 'C']);
  });

  test('Y11. `-` direction → never grows (returns empty array)', () => {
    const out = pickGrowthParents(['A', 'B'], '-', () => true);
    assert.deepEqual(out, []);
  });

  test('Y12. `+` with all-expanded ids → no parents to grow into', () => {
    const out = pickGrowthParents(['A', 'B'], '+', () => false);
    assert.deepEqual(out, []);
  });

  // ---- directChildIdsOf ------------------------------------------------

  test('Y13. direct children at parentDepth+1 only; deeper descendants skipped', () => {
    const rows: RowDepthEntry[] = [
      { id: 'P', depth: 0 },
      { id: 'P/a', depth: 1 },
      { id: 'P/a/x', depth: 2 },
      { id: 'P/b', depth: 1 },
      { id: 'P/b/y', depth: 2 },
      { id: 'P/c', depth: 1 },
    ];
    assert.deepEqual(directChildIdsOf('P', rows), ['P/a', 'P/b', 'P/c']);
  });

  test('Y14. stops at first row whose depth <= parentDepth', () => {
    const rows: RowDepthEntry[] = [
      { id: 'P', depth: 1 },
      { id: 'P/a', depth: 2 },
      { id: 'Q', depth: 1 }, // sibling at parent depth → stop
      { id: 'Q/a', depth: 2 },
    ];
    assert.deepEqual(directChildIdsOf('P', rows), ['P/a']);
  });

  test('Y15. parent missing from list → empty result', () => {
    const rows: RowDepthEntry[] = [{ id: 'A', depth: 0 }];
    assert.deepEqual(directChildIdsOf('Z', rows), []);
  });

  test('Y16. parent has no immediate children at depth+1 → empty result', () => {
    const rows: RowDepthEntry[] = [
      { id: 'P', depth: 0 },
      { id: 'P/a/x', depth: 2 }, // gap — no depth-1 child
    ];
    assert.deepEqual(directChildIdsOf('P', rows), []);
  });

  // ---- Composite scenarios mirroring the user's spec -------------------

  test('Y17. spec scenario: 1 tree + 1 table-row with 2 chevrons → tree id is the only growth seed; cell children are the host payload', () => {
    const ids = ['T1', 'R1'];
    const isTableRow = (id: string): boolean => id === 'R1';
    const part = partitionByTableRow(ids, isTableRow);
    assert.deepEqual(part.treeIds, ['T1']);
    assert.deepEqual(part.tableRowIds, ['R1']);

    const growth = pickGrowthParents(part.treeIds, '+', () => true /* T1 collapsed */);
    assert.deepEqual(growth, ['T1']);

    const cellChildren = collectCellChildIdsToFlip(part.tableRowIds, '+', () => [
      { childId: 'R1/A', isExpanded: false },
      { childId: 'R1/B', isExpanded: false },
    ]);
    assert.deepEqual(cellChildren, ['R1/A', 'R1/B']);

    /* The webview combines treeIds + cellChildren into ONE batch. The
     * table-row id ('R1') itself is NOT in the host payload — only its
     * cell children are. */
    const hostPayload = part.treeIds.concat(cellChildren);
    assert.deepEqual(hostPayload, ['T1', 'R1/A', 'R1/B']);
    assert.ok(!hostPayload.includes('R1'), 'table-row id MUST NOT be in host payload');
  });

  test('Y18. spec scenario: pure-table-row selection → host payload has zero tree ids; only cell children', () => {
    const part = partitionByTableRow(['R1'], () => true);
    const cellChildren = collectCellChildIdsToFlip(part.tableRowIds, '+', () => [
      { childId: 'R1/A', isExpanded: false },
      { childId: 'R1/B', isExpanded: false },
    ]);
    const hostPayload: string[] = part.treeIds.concat(cellChildren);
    assert.equal(part.treeIds.length, 0);
    assert.deepEqual(hostPayload, ['R1/A', 'R1/B']);
  });

  test('Y19. spec scenario: table row with NO chevron cells → empty host payload (no message would be posted)', () => {
    const part = partitionByTableRow(['R1'], () => true);
    const cellChildren = collectCellChildIdsToFlip(part.tableRowIds, '+', () => []);
    const hostPayload: string[] = part.treeIds.concat(cellChildren);
    assert.deepEqual(hostPayload, []);
  });

  test('Y20. spec scenario: `-` on a row with mixed chevron states → only expanded cells flip', () => {
    const part = partitionByTableRow(['R1'], () => true);
    const cellChildren = collectCellChildIdsToFlip(part.tableRowIds, '-', () => [
      { childId: 'R1/A', isExpanded: false }, // skip
      { childId: 'R1/B', isExpanded: true }, // flip
      { childId: 'R1/C', isExpanded: true }, // flip
    ]);
    assert.deepEqual(cellChildren, ['R1/B', 'R1/C']);
  });
});
