/**
 * Pure helpers used by the `+` / `-` batch handler in
 * grid-view-webview-script.ts. Extracted so the partition / cell-chevron
 * collection / growth logic can be unit tested without a real DOM.
 *
 * Issues addressed (B.6 second post-verification round):
 *   - Issue X (selection growth on `+`): when the batch expands a
 *     selected tree node, its newly-revealed direct children should join
 *     the selection set so a second `+` drills further. `directChildIdsOf`
 *     gives the list to add for one parent; `pickGrowthParents` filters
 *     the original selection to the ids that will actually expand under
 *     the direction-guarded batch.
 *   - Issue Y (`+` on a row inside a table region): the row stays in the
 *     table; cells with chevrons grow vertically. `partitionByTableRow`
 *     splits the selected ids into "tree" vs "table-row" buckets, and
 *     `collectCellChildIdsToFlip` walks each table row's chevron-bearing
 *     cells under the same direction guard the host applies for tree
 *     ids.
 *
 * The webview JS twin in mouse-bindings-webview-js.ts mirrors these
 * algorithms inline (the project ships no bundler — see the canonical-
 * source banner there).
 */

/** Split a selection into ids that are TABLE DATA ROWS (rendered inside a
 *  table region as `r-trow`, not `t-header`) vs everything else.
 *
 *  The discriminator is purely DOM-class based; the caller passes in an
 *  `isTableRow(id)` predicate that resolves to true iff the row's element
 *  carries the `r-trow` class but NOT `t-header` (header rows have no
 *  `data-node-id` so they never make it into a selection anyway).
 *
 *  Ids whose row is not in the DOM at all are treated as TREE ids — they
 *  are the historic Q6 hidden-descendant case which the host already
 *  handles atomically.
 */
export function partitionByTableRow(
  ids: readonly string[],
  isTableRow: (id: string) => boolean,
): { treeIds: string[]; tableRowIds: string[] } {
  const treeIds: string[] = [];
  const tableRowIds: string[] = [];
  for (const id of ids) {
    if (isTableRow(id)) {
      tableRowIds.push(id);
    } else {
      treeIds.push(id);
    }
  }
  return { treeIds, tableRowIds };
}

/** From a list of TREE ids, pick those that will actually expand under a
 *  direction-guarded `+` batch — i.e. ids that are currently collapsed.
 *  Used as the seed list for selection growth (Issue X): only nodes that
 *  the batch ACTUALLY expands contribute their newly-visible children.
 *
 *  No-op for `-` — the caller never grows on collapse. Returning an
 *  empty array would be the same behaviour, but the signature documents
 *  intent. */
export function pickGrowthParents(
  treeIds: readonly string[],
  direction: '+' | '-',
  isCollapsed: (id: string) => boolean,
): string[] {
  if (direction !== '+') {
    return [];
  }
  const out: string[] = [];
  for (const id of treeIds) {
    if (isCollapsed(id)) {
      out.push(id);
    }
  }
  return out;
}

/** For each TABLE-ROW id, walk its row element's `.expand-toggle.cell-toggle`
 *  chevrons and collect the chevron's `data-node-id` (a child element id
 *  of the row) for every chevron whose state needs to flip under the
 *  direction guard:
 *    - `+` flips chevrons that are currently collapsed (`data-expanded="false"`)
 *    - `-` flips chevrons that are currently expanded (`data-expanded="true"`)
 *
 *  The caller passes a `getRowCellChevrons(rowId)` accessor that returns
 *  one descriptor per `.cell-toggle` inside that row.
 *
 *  Returns ids in input order (rowId order, then chevron order within
 *  each row) — important for deterministic batching. */
export function collectCellChildIdsToFlip(
  tableRowIds: readonly string[],
  direction: '+' | '-',
  getRowCellChevrons: (rowId: string) => Array<{ childId: string; isExpanded: boolean }>,
): string[] {
  const out: string[] = [];
  for (const rowId of tableRowIds) {
    const chevrons = getRowCellChevrons(rowId);
    for (const ch of chevrons) {
      if (direction === '+' && !ch.isExpanded) {
        out.push(ch.childId);
      } else if (direction === '-' && ch.isExpanded) {
        out.push(ch.childId);
      }
    }
  }
  return out;
}

/** A minimal row descriptor used by `directChildIdsOf` — the caller
 *  derives this from the rendered DOM's `.g-row[data-node-id]` order
 *  (with `data-depth` parsed).
 *
 *  Optional `isExpanded` is required only by `pickInnermostExpanded`
 *  (Z7) so every row's expansion state can participate in the deepest-
 *  expanded-descendant walk — including expanded rows that are NOT
 *  themselves in the selection.
 *
 *  Z14 additions (synthesized `#group` table-region roots):
 *    - `isTableRow` — true when the DOM element carries the `.r-trow`
 *      class. Used to extend the subtree boundary of a `#group` root
 *      across same-depth table-data rows.
 *    - `cellChevrons` — chevron descriptors inside an r-trow
 *      (`.expand-toggle.cell-toggle` elements). Their expansion is
 *      treated as one level deeper than the host `#group`, so an
 *      expanded `meta` cell is the innermost collapse target before
 *      the whole table region. */
export interface RowDepthEntry {
  id: string;
  depth: number;
  isExpanded?: boolean;
  isTableRow?: boolean;
  cellChevrons?: ReadonlyArray<{ childId: string; isExpanded: boolean }>;
}

/** Z14 — synthesized-`#group` id predicate. The grid renderer emits
 *  these ids as `${firstChild.nodeId}#group` (see grid-renderer.ts
 *  emitTableChildren). They are tree-ish from a selection point of view
 *  (not `.r-trow`) but host a flat list of same-depth `.r-trow` data
 *  rows beneath them. */
export function isGroupRootId(id: string): boolean {
  return id.length >= 6 && id.lastIndexOf('#group') === id.length - 6;
}

/** Given the parent id and the DOM-ordered list of (id, depth) entries,
 *  return the ids of every direct-child row of `parentId` — i.e. rows
 *  immediately following `parentId` whose depth equals `parentDepth + 1`,
 *  stopping at the first row whose depth is `<= parentDepth`.
 *
 *  Includes attribute rows (`…/@name`), text rows (`…/#text`), table
 *  data rows (`r-trow`) and the `…#group` table-region label rows —
 *  every kind that carries a `data-node-id` and renders one depth deeper
 *  than the parent. This is the Issue X "newly-visible direct children"
 *  set the selection grows into.
 *
 *  Returns an empty array when `parentId` is not in the list or has no
 *  immediate children at the expected depth. */
export function directChildIdsOf(
  parentId: string,
  rows: readonly RowDepthEntry[],
): string[] {
  let parentIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].id === parentId) {
      parentIdx = i;
      break;
    }
  }
  if (parentIdx === -1) {
    return [];
  }
  const parentDepth = rows[parentIdx].depth;
  const childDepth = parentDepth + 1;
  const out: string[] = [];
  for (let i = parentIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.depth <= parentDepth) {
      break;
    }
    if (r.depth === childDepth) {
      out.push(r.id);
    }
  }
  return out;
}

/**
 * Z1 / Z2 — renderable-id delta used by the selection-growth pass.
 *
 * Given the ordered list of renderable ids BEFORE a batch `+` and the
 * ordered list AFTER the host re-rendered, return every newly-revealed
 * id in `after` (those NOT present in `before`), preserving `after`'s
 * document order.
 *
 * This naturally covers everything the narrower `directChildIdsOf` walk
 * missed: attribute rows (`…/@name`), synthesized `…/#text` rows, table
 * data rows (`.r-trow`), and synthesized `…#group` header rows. The
 * selection grows into the *exact* set of ids that the DOM revealed.
 */
export function computeIdDelta(
  before: readonly string[],
  after: readonly string[],
): string[] {
  const oldSet = new Set(before);
  const out: string[] = [];
  for (const id of after) {
    if (!oldSet.has(id)) {
      out.push(id);
    }
  }
  return out;
}

/** Expanded-row descriptor — retained for backwards compatibility with
 *  earlier callers; `pickInnermostExpanded` (Z7) now accepts a plain
 *  `selectedIds` array and reads expansion state off `RowDepthEntry`. */
export interface ExpandedRowEntry {
  id: string;
  depth: number;
  index: number;
}

/**
 * Z3 / Z7 / Z14 — pick the INNERMOST expanded rows for a batch `-`,
 * PER SELECTION BRANCH.
 *
 * Algorithm (Z14 refinement — 2026-04-20):
 *   1. Identify every selected row that is currently expanded in the
 *      DOM (the "selected+expanded" set). These are the roots from
 *      which we search for deeper expansion frontiers.
 *   2. Compute each selected+expanded row's SUBTREE SPAN. For ordinary
 *      element roots the span ends at the first row with depth
 *      ≤ rootDepth (Z7). For synthesized `#group` roots the span
 *      extends across same-depth `.r-trow` table-data rows and ends at
 *      the first row whose depth is < rootDepth OR whose depth equals
 *      rootDepth AND is NOT an `.r-trow`.
 *   3. Determine the SELECTION ROOTS = selected+expanded rows whose
 *      strict-span ancestors in the selected+expanded set are ABSENT.
 *      Two selection roots never share an ancestor-descendant
 *      relationship, so each represents one independent "branch".
 *   4. For each selection root R, enumerate CANDIDATES inside R's
 *      span:
 *        - any row at depth > R.depth that is currently expanded
 *          (logicalDepth = row.depth),
 *        - for `#group` roots only: every expanded cell-chevron inside
 *          a same-depth `.r-trow` (logicalDepth = R.depth + 1) — this
 *          covers e.g. an element-in-one-cell `meta` expansion.
 *      Pick the MAXIMUM logicalDepth and emit every candidate at that
 *      depth. If there are no candidates, emit R itself.
 *
 * Symmetric with `+`: one press of `-` undoes one press of `+` PER
 * BRANCH, never mixing branches.
 */
export function pickInnermostExpanded(
  orderedRows: readonly RowDepthEntry[],
  selectedIds: readonly string[],
): string[] {
  const selSet = new Set(selectedIds);
  const selExpIdx: number[] = [];
  for (let i = 0; i < orderedRows.length; i++) {
    if (!selSet.has(orderedRows[i].id)) continue;
    if (!orderedRows[i].isExpanded) continue;
    selExpIdx.push(i);
  }
  if (selExpIdx.length === 0) return [];

  // Memoized subtree-end index per root (exclusive). Honors the
  // `#group` same-depth `.r-trow` extension (Z14).
  const endCache = new Map<number, number>();
  const getSubtreeEnd = (rootIdx: number): number => {
    const cached = endCache.get(rootIdx);
    if (cached !== undefined) return cached;
    const rootDepth = orderedRows[rootIdx].depth;
    const isGroup = isGroupRootId(orderedRows[rootIdx].id);
    let end = orderedRows.length;
    for (let k = rootIdx + 1; k < orderedRows.length; k++) {
      const d = orderedRows[k].depth;
      if (d < rootDepth) { end = k; break; }
      if (d === rootDepth) {
        if (!isGroup) { end = k; break; }
        if (!orderedRows[k].isTableRow) { end = k; break; }
      }
    }
    endCache.set(rootIdx, end);
    return end;
  };

  // Row Y at index `yIdx` is a DOM-span descendant of row X at index
  // `xIdx` iff xIdx < yIdx < subtreeEnd(xIdx). Works uniformly for
  // ordinary and `#group` roots via the boundary rule above.
  const isDescendant = (xIdx: number, yIdx: number): boolean => {
    if (yIdx <= xIdx) return false;
    return yIdx < getSubtreeEnd(xIdx);
  };

  // Selection roots: no ancestor (in selExpIdx) contains them.
  const rootIndices: number[] = [];
  for (const idx of selExpIdx) {
    let hasAncestorSelected = false;
    for (const other of selExpIdx) {
      if (other === idx) continue;
      if (isDescendant(other, idx)) { hasAncestorSelected = true; break; }
    }
    if (!hasAncestorSelected) rootIndices.push(idx);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const rootIdx of rootIndices) {
    const rootRow = orderedRows[rootIdx];
    const rootDepth = rootRow.depth;
    const isGroup = isGroupRootId(rootRow.id);
    const endIdx = getSubtreeEnd(rootIdx);

    // Enumerate candidates with their LOGICAL depth.
    const cands: Array<{ logicalDepth: number; id: string }> = [];
    for (let k = rootIdx + 1; k < endIdx; k++) {
      const r = orderedRows[k];
      if (r.depth > rootDepth && r.isExpanded) {
        cands.push({ logicalDepth: r.depth, id: r.id });
      }
      if (isGroup && r.depth === rootDepth && r.isTableRow && r.cellChevrons) {
        for (const ch of r.cellChevrons) {
          if (ch.isExpanded) {
            cands.push({ logicalDepth: rootDepth + 1, id: ch.childId });
          }
        }
      }
    }

    let maxD = rootDepth;
    for (const c of cands) if (c.logicalDepth > maxD) maxD = c.logicalDepth;

    if (maxD === rootDepth) {
      if (!seen.has(rootRow.id)) {
        seen.add(rootRow.id);
        out.push(rootRow.id);
      }
      continue;
    }
    for (const c of cands) {
      if (c.logicalDepth !== maxD) continue;
      if (!seen.has(c.id)) {
        seen.add(c.id);
        out.push(c.id);
      }
    }
  }
  return out;
}
