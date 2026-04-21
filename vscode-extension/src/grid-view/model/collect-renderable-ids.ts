import { GridNode } from './grid-node';
import { groupChildSegments } from '../view/group-table-runs';

/**
 * Walk a GridModel tree and collect every `data-node-id` value that
 * could appear in the rendered DOM for the current tree, in DOM /
 * render order. Used by `postReconcile` in grid-view-panel.ts so the
 * webview selection reconcile does not drop synthesized ids that exist
 * in the DOM but not in the tree.
 *
 * Historical `collectNodeIds` (the previous implementation) emitted
 * every element + comment id in the tree regardless of whether the id
 * was currently visible — reconcile is intentionally permissive so a
 * selected descendant under a collapsed ancestor survives a re-render.
 * This helper preserves that semantics for the real-node ids AND
 * additionally emits:
 *   - synthesized `{firstChild.nodeId}#group` ids for every contiguous
 *     multi-element run under a table-candidate parent (B.6 bug fix —
 *     without these, a selected `.r-tregion-label` header row loses its
 *     `.selected` class after the host-driven re-render that a batch
 *     `+` / `-` triggers).
 *   - attribute-row ids (`{parent.nodeId}/@{name}`) for every attribute.
 *   - synthesized `{parent.nodeId}/#text` ids for mixed-content text rows.
 *
 * The attribute / text-row emission is required so that the selection
 * growth pass can diff before/after renderable-id lists without losing
 * attribute and synthesized #text ids. Without these ids in
 * `existingIds`, the next reconcile would immediately drop the attrs
 * the growth pass just added.
 */
export function collectRenderableIds(root: GridNode): string[] {
  const out: string[] = [];
  for (const c of root.preRootComments) {
    out.push(c.nodeId);
  }
  walk(root, out);
  for (const c of root.postRootComments) {
    out.push(c.nodeId);
  }
  return out;
}

function walk(node: GridNode, out: string[]): void {
  out.push(node.nodeId);
  if (node.type === 'comment') return;

  // Attribute rows and (possibly) the synthesized text-content row render
  // as `.g-row[data-node-id]` children of the owning element. Emit them
  // regardless of the element's current expansion state — reconcile is
  // intentionally permissive (see module docblock) so a hidden attribute
  // can survive a re-render.
  for (const attr of node.attributes) {
    out.push(`${node.nodeId}/@${attr.name}`);
  }
  const hasSeparateTextValueRow =
    node.attributes.length > 0 &&
    node.children.length === 0 &&
    !node.isTableLike &&
    !!node.value;
  if (hasSeparateTextValueRow) {
    out.push(`${node.nodeId}/#text`);
  }

  // Emit synthesized `#group` ids for every contiguous same-name run,
  // regardless of the parent's `isTableLike` flag. Drill-box interiors
  // route non-table-like hosts (e.g. `<meta>` with a run of `<sub>`
  // children) through the same `emitSegmentedChildren` path, which
  // synthesizes a group header for the run — that header must round-
  // trip through reconcile when selected.
  const segments = groupChildSegments(node.children);
  for (const seg of segments) {
    if (seg.kind === 'table') {
      out.push(seg.nodes[0].nodeId + '#group');
    }
  }

  for (const child of node.children) {
    walk(child, out);
  }
}
