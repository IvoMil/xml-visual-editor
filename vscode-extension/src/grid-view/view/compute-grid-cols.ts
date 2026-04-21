import { GridNode } from '../model/grid-node';
import { groupChildSegments } from './group-table-runs';

/** Closures the walker needs to reach renderer-owned toggle state without
 *  importing the renderer module. */
export interface GridColsCtx {
  isTableModeOn: (parent: GridNode) => boolean;
  isFlipped: (parent: GridNode) => boolean;
}

/** Pre-scan visible tree to compute total grid column count.
 *  N = max( maxVisibleDepth + 1,
 *           max over visible tables of (tableParentDepth + 1 + tableDataColCount) )
 *  The grid uses `repeat(N, max-content) 1fr`; all placements must reference
 *  grid lines in 1..N+1 (plus `-1` for the trailing 1fr track). */
export function computeGridCols(root: GridNode, ctx: GridColsCtx): number {
  const acc = { maxCols: 1 };
  walkForCols(root, 0, acc, ctx);
  return acc.maxCols;
}

/** Recursively walk visible nodes to find max column extent.
 *
 *  `bodyDepthShift` mirrors the same-named parameter on
 *  `GridRenderer.emitNode`: when a node is a member of a tree-ladder
 *  run, its body renders at `depth + 1 + shift`, so column accounting
 *  must include the extra track. */
function walkForCols(
  node: GridNode,
  depth: number,
  acc: { maxCols: number },
  ctx: GridColsCtx,
  bodyDepthShift = 0,
): void {
  if (node.type === 'comment') return; // comments stretch to -1, add no tracks
  const isNonLeaf = node.hasChildren || node.isTableLike;
  if (!isNonLeaf) {
    // Leaf name at (D+1)/(D+2) requires N >= D+1.
    acc.maxCols = Math.max(acc.maxCols, depth + 1);
  }
  if (node.hasAttributes) {
    // Attribute row is a leaf at D+1+shift: name (D+2+shift)/(D+3+shift)
    // requires N >= D+2+shift.
    acc.maxCols = Math.max(acc.maxCols, depth + 2 + bodyDepthShift);
  }
  if (!node.isExpanded) return;

  const childDepth = depth + 1 + bodyDepthShift;
  if (node.isTableLike) {
    const tableOn = ctx.isTableModeOn(node);
    if (!tableOn) {
      // Run members get +1 body shift. Use the same contiguous-run
      // grouping the tree-ladder emitter uses so column accounting
      // matches emission exactly.
      const segs = groupChildSegments(node.children);
      for (const seg of segs) {
        if (seg.kind === 'comment') continue;
        if (seg.kind === 'unique') {
          walkForCols(seg.node, childDepth, acc, ctx);
          continue;
        }
        for (const member of seg.nodes) {
          walkForCols(member, childDepth, acc, ctx, 1);
        }
      }
      return;
    }
    const flipped = ctx.isFlipped(node);
    // Use the same contiguous-run grouping the renderer uses, so column
    // accounting matches what is actually emitted.
    const segs = groupChildSegments(node.children);
    for (const seg of segs) {
      if (seg.kind === 'comment') continue; // comments stretch to -1
      if (seg.kind === 'unique') {
        walkForCols(seg.node, childDepth, acc, ctx);
        continue;
      }
      const attrNames = new Set<string>();
      const elemNames = new Set<string>();
      let hasText = false;
      for (const n of seg.nodes) {
        for (const a of n.attributes) attrNames.add(a.name);
        for (const c of n.children) {
          if (c.type === 'comment') continue; // comments are separate r-comment rows
          elemNames.add(c.name);
        }
        if (n.value) hasText = true;
      }
      let dataCols = attrNames.size + elemNames.size;
      // Synthesized "(value)" column for text-only repeated leaves.
      if (dataCols === 0 && hasText) dataCols = 1;
      // When flipped, the table has one column per ORIGINAL row (N = seg.nodes.length) instead of per original
      // col. Grid-column accounting uses whichever is larger.
      const effectiveDataCols = flipped ? seg.nodes.length : dataCols;
      acc.maxCols = Math.max(acc.maxCols, depth + 3 + effectiveDataCols);
      // Hybrid drill-boxes own their internal grid template (set on the
      // .g-drill-box wrapper at render time), so the outer grid never
      // needs additional tracks for drill-down content. The wrapper
      // lives inside a single host column track of the outer grid.
    }
  } else {
    for (const child of node.children) {
      walkForCols(child, childDepth, acc, ctx);
    }
  }
}
