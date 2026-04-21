/**
 * B.1.g — `topLevelSelectedNodeIds` helper (DESIGN_GRID_ALIGNMENT.md §9.6).
 *
 * Given a selection set and an ancestor-lookup function, returns the
 * subset of selected node ids that have NO selected ancestor. When a
 * parent and a child are both selected, only the parent survives; when
 * selections are disjoint across unrelated subtrees, each subtree's
 * shallowest selected node is returned.
 *
 * Used by the inline toggle-icon emission path to gate the table-mode
 * OFF (⊞) icon: it must render only on the OUTERMOST selected
 * hybrid-table-candidate of each disjoint nested group.
 *
 * Complexity: O(N·D) where N is the selection size and D the maximum
 * ancestor walk depth (bounded by the tree depth). The selection is
 * always small in practice (dozens of ids at most), so the simple walk
 * is sufficient.
 */
export function topLevelSelectedNodeIds(
  selectedIds: ReadonlySet<string>,
  getParentId: (nodeId: string) => string | undefined,
): ReadonlySet<string> {
  const out = new Set<string>();
  for (const id of selectedIds) {
    let hasSelectedAncestor = false;
    let p = getParentId(id);
    while (p !== undefined) {
      if (selectedIds.has(p)) {
        hasSelectedAncestor = true;
        break;
      }
      p = getParentId(p);
    }
    if (!hasSelectedAncestor) out.add(id);
  }
  return out;
}
