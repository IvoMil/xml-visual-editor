/**
 * DOM walker inline JS for pickInnermostExpandedFromDom.
 *
 * Kept as a separate module so the main webview script stays under the
 * 500-line ceiling. The algorithm mirrors `pickInnermostExpanded` in
 * `batch-expand-helpers.ts` but reads row depth + expansion state
 * directly from the DOM (no bundler → no cross-file imports in the
 * webview). Canonical tests live in
 * `grid-view-batch-expand-helpers.test.ts`.
 *
 * Subtree walk for synthesized `#group` roots extends across
 * same-depth `.r-trow` data rows. Expanded `.expand-toggle.cell-toggle`
 * chevrons inside those r-trow rows contribute candidates at
 * logicalDepth = rootDepth + 1 (e.g. element-in-one-cell `meta`).
 */
export const GRID_PICK_INNERMOST_JS = String.raw`
function __isGroupRootIdJS(id) {
  return typeof id === 'string'
    && id.length >= 6
    && id.lastIndexOf('#group') === id.length - 6;
}
function __collectCellChevronsJS(rowEl) {
  var out = [];
  var chevrons = rowEl.querySelectorAll('.expand-toggle.cell-toggle');
  for (var i = 0; i < chevrons.length; i++) {
    var cid = chevrons[i].getAttribute('data-node-id');
    if (!cid) continue;
    out.push({
      childId: cid,
      isExpanded: chevrons[i].getAttribute('data-expanded') === 'true',
    });
  }
  return out;
}
function __buildOrderedRowDepthIndex(container) {
  var rows = container.querySelectorAll('.g-row[data-node-id]');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var id = rows[i].getAttribute('data-node-id');
    if (!id) continue;
    var d = parseInt(rows[i].getAttribute('data-depth') || '0', 10);
    var isTrow = rows[i].classList.contains('r-trow')
      && !rows[i].classList.contains('t-header');
    out.push({
      id: id, depth: d, index: out.length,
      isExpanded: __isRowElExpanded(rows[i]),
      isTableRow: isTrow,
      cellChevrons: isTrow ? __collectCellChevronsJS(rows[i]) : null,
    });
  }
  return out;
}
function __isRowElExpanded(rowEl) {
  if (!rowEl) return false;
  var t = rowEl.querySelector(':scope > .c-name > .expand-toggle, :scope > .expand-toggle');
  if (!t) t = rowEl.querySelector('.expand-toggle');
  return !!(t && t.getAttribute('data-expanded') === 'true');
}
function __pickInnermostExpandedFromDom(container, treeIds) {
  var ordered = __buildOrderedRowDepthIndex(container);
  var selSet = new Set(treeIds);
  var selExpIdx = [];
  for (var i = 0; i < ordered.length; i++) {
    if (selSet.has(ordered[i].id) && ordered[i].isExpanded) selExpIdx.push(i);
  }
  if (selExpIdx.length === 0) return [];
  var endCache = new Map();
  function getEnd(rootIdx) {
    if (endCache.has(rootIdx)) return endCache.get(rootIdx);
    var rootDepth = ordered[rootIdx].depth;
    var isGroup = __isGroupRootIdJS(ordered[rootIdx].id);
    var end = ordered.length;
    for (var k = rootIdx + 1; k < ordered.length; k++) {
      var d = ordered[k].depth;
      if (d < rootDepth) { end = k; break; }
      if (d === rootDepth) {
        if (!isGroup) { end = k; break; }
        if (!ordered[k].isTableRow) { end = k; break; }
      }
    }
    endCache.set(rootIdx, end);
    return end;
  }
  function isDesc(xIdx, yIdx) {
    if (yIdx <= xIdx) return false;
    return yIdx < getEnd(xIdx);
  }
  var rootIndices = [];
  for (var si = 0; si < selExpIdx.length; si++) {
    var idxR = selExpIdx[si], hasAnc = false;
    for (var sj = 0; sj < selExpIdx.length; sj++) {
      if (selExpIdx[sj] === idxR) continue;
      if (isDesc(selExpIdx[sj], idxR)) { hasAnc = true; break; }
    }
    if (!hasAnc) rootIndices.push(idxR);
  }
  var out = [], seen = new Set();
  for (var ri = 0; ri < rootIndices.length; ri++) {
    var rootIdx = rootIndices[ri];
    var rootRow = ordered[rootIdx];
    var rootDepth = rootRow.depth;
    var isGroup = __isGroupRootIdJS(rootRow.id);
    var endIdx = getEnd(rootIdx);
    var cands = [];
    for (var k = rootIdx + 1; k < endIdx; k++) {
      var r = ordered[k];
      if (r.depth > rootDepth && r.isExpanded) {
        cands.push({ logicalDepth: r.depth, id: r.id });
      }
      if (isGroup && r.depth === rootDepth && r.isTableRow && r.cellChevrons) {
        for (var ci = 0; ci < r.cellChevrons.length; ci++) {
          var ch = r.cellChevrons[ci];
          if (ch.isExpanded) {
            cands.push({ logicalDepth: rootDepth + 1, id: ch.childId });
          }
        }
      }
    }
    var maxD = rootDepth;
    for (var mi = 0; mi < cands.length; mi++) {
      if (cands[mi].logicalDepth > maxD) maxD = cands[mi].logicalDepth;
    }
    if (maxD === rootDepth) {
      if (!seen.has(rootRow.id)) { seen.add(rootRow.id); out.push(rootRow.id); }
      continue;
    }
    for (var ei = 0; ei < cands.length; ei++) {
      if (cands[ei].logicalDepth !== maxD) continue;
      if (!seen.has(cands[ei].id)) {
        seen.add(cands[ei].id);
        out.push(cands[ei].id);
      }
    }
  }
  return out;
}
`;
