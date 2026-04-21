/**
 * Inline JS twin of GridSelectionModel for the webview runtime — the
 * selection-model half of the mouse-bindings twin pair.
 *
 * Split out of mouse-bindings-webview-js.ts (2026-04) to keep every
 * source file under the project's 500-line ceiling. The contents of
 * this string are concatenated verbatim ahead of the controller twin
 * by grid-view-webview-script.ts (via GRID_MOUSE_BINDINGS_JS) so the
 * emitted `<script>` body is byte-equivalent to the pre-split version.
 *
 * CANONICAL TYPESCRIPT SOURCE (keep in sync — any semantic change must
 * be mirrored):
 *   - vscode-extension/src/grid-view/model/grid-selection.ts
 *
 * Exposes a single factory `__mkSelection()` returning an object with
 * the same public surface as GridSelectionModel (has, replaceWith,
 * toggle, extendRangeTo, collapseToCursor, selectAll, addIds,
 * removeIds, captureFingerprints, getFingerprints, reconcile,
 * reconcileWithFingerprints, toJSON; plus `size`, `anchor`,
 * `activeCursor` getters). The controller twin closes over this
 * factory's returned object.
 */
export const GRID_MOUSE_BINDINGS_SELECTION_JS = String.raw`
/* ---- Inline GridSelectionModel (twin of model/grid-selection.ts) ---- */
function __mkSelection() {
  var nodeIds = new Set();
  var anchor = null;
  var activeCursor = null;
  /* Z9 — captured content fingerprints per selected id. */
  var fingerprints = new Map();
  /* B.1.e / Q7 — synthetic column ids (kind='column'). Parallel to
   * nodeIds (row axis). Survive reconcile iff their parent is still
   * rendered. B.1.h — carry anchor + activeCursor for Shift/Ctrl range
   * extension, mirroring the row-axis fields above. Mutual exclusion
   * (Invariant I3): every row-adding mutator clears columns first, and
   * vice versa. */
  var columns = new Set();
  var columnAnchor = null;
  var columnCursor = null;
  /* B.1.e / D0.1 — first reconcile on a fresh doc leaves the selection
   * empty (no fallback to first visible id). Flipped true by any
   * mutator AND at the end of every reconcile. */
  var initialReconcileDone = false;

  function clearInternal() {
    nodeIds = new Set(); anchor = null; activeCursor = null;
    fingerprints = new Map();
  }
  function clearRowAxis() {
    if (nodeIds.size === 0 && anchor === null && activeCursor === null) return;
    nodeIds = new Set(); anchor = null; activeCursor = null;
  }
  function clearColumnAxis() {
    columns = new Set(); columnAnchor = null; columnCursor = null;
  }
  function pickFallbackCursor(removedId) {
    if (anchor !== null && anchor !== removedId && nodeIds.has(anchor)) return anchor;
    var it = nodeIds.values().next();
    return it.value;
  }
  function toJSON() {
    return {
      nodeIds: Array.from(nodeIds),
      anchor: anchor,
      activeCursor: activeCursor,
      columnIds: Array.from(columns),
      columnAnchor: columnAnchor,
      columnActiveCursor: columnCursor,
    };
  }
  return {
    get size() { return nodeIds.size; },
    get anchor() { return anchor; },
    get activeCursor() { return activeCursor; },
    get columnSize() { return columns.size; },
    get columnAnchor() { return columnAnchor; },
    get columnActiveCursor() { return columnCursor; },
    has: function(id) { return nodeIds.has(id); },
    hasColumn: function(cid) { return columns.has(cid); },
    /* B.1.h — column-axis mutators (twin of GridSelectionModel). Each
     * add-path call clears the row axis first to enforce Invariant I3. */
    selectColumn: function(cid) {
      clearRowAxis();
      columns = new Set([cid]); columnAnchor = cid; columnCursor = cid;
      initialReconcileDone = true;
    },
    addColumn: function(cid) {
      clearRowAxis();
      columns.add(cid);
      if (columnAnchor === null) columnAnchor = cid;
      columnCursor = cid;
      initialReconcileDone = true;
    },
    toggleColumn: function(cid) {
      if (columns.has(cid)) {
        columns.delete(cid);
        if (columns.size === 0) { columnAnchor = null; columnCursor = null; return; }
        if (columnCursor === cid) {
          columnCursor = (columnAnchor !== null && columnAnchor !== cid && columns.has(columnAnchor))
            ? columnAnchor : columns.values().next().value;
        }
        if (columnAnchor === cid) columnAnchor = columnCursor;
        initialReconcileDone = true;
        return;
      }
      clearRowAxis();
      columns.add(cid);
      if (columnAnchor === null) columnAnchor = cid;
      columnCursor = cid;
      initialReconcileDone = true;
    },
    extendColumnRange: function(cid, orderedColumnIds) {
      clearRowAxis();
      var tIdx = orderedColumnIds.indexOf(cid);
      if (tIdx === -1) {
        columns = new Set([cid]); columnAnchor = cid; columnCursor = cid;
        initialReconcileDone = true;
        return;
      }
      var aIdx = columnAnchor === null ? -1 : orderedColumnIds.indexOf(columnAnchor);
      if (aIdx === -1) { columnAnchor = cid; aIdx = tIdx; }
      var lo = Math.min(aIdx, tIdx);
      var hi = Math.max(aIdx, tIdx);
      columns = new Set(orderedColumnIds.slice(lo, hi + 1));
      columnCursor = cid;
      initialReconcileDone = true;
    },
    clearColumns: clearColumnAxis,
    clear: function() {
      clearInternal();
      clearColumnAxis();
      initialReconcileDone = false;
    },
    replaceWith: function(id) {
      clearColumnAxis();
      nodeIds = new Set([id]); anchor = id; activeCursor = id;
      initialReconcileDone = true;
    },
    toggle: function(id) {
      if (nodeIds.has(id)) {
        nodeIds.delete(id);
        if (nodeIds.size === 0) { clearInternal(); initialReconcileDone = true; return; }
        if (activeCursor === id) activeCursor = pickFallbackCursor(id);
        if (anchor === id) anchor = activeCursor;
        initialReconcileDone = true;
        return;
      }
      clearColumnAxis();
      nodeIds.add(id);
      if (anchor === null) anchor = id;
      activeCursor = id;
      initialReconcileDone = true;
    },
    extendRangeTo: function(id, orderedVisible) {
      clearColumnAxis();
      var targetIdx = orderedVisible.indexOf(id);
      if (targetIdx === -1) {
        nodeIds = new Set([id]); anchor = id; activeCursor = id;
        initialReconcileDone = true;
        return;
      }
      var anchorIdx = anchor === null ? -1 : orderedVisible.indexOf(anchor);
      if (anchorIdx === -1) { anchor = id; anchorIdx = targetIdx; }
      var lo = Math.min(anchorIdx, targetIdx);
      var hi = Math.max(anchorIdx, targetIdx);
      nodeIds = new Set(orderedVisible.slice(lo, hi + 1));
      activeCursor = id;
      initialReconcileDone = true;
    },
    collapseToCursor: function() {
      if (activeCursor === null) return;
      var c = activeCursor; nodeIds = new Set([c]); anchor = c;
      initialReconcileDone = true;
    },
    /* Z10 — preserve existing anchor + cursor when still present in
     * visibleIds; only fall back to anchorHint (when present in set) or
     * the first visible id when the previous value was dropped. */
    selectAll: function(visibleIds, anchorHint) {
      if (visibleIds.length === 0) return;
      clearColumnAxis();
      nodeIds = new Set(visibleIds);
      var first = visibleIds[0];
      var hint = (anchorHint !== undefined && anchorHint !== null && nodeIds.has(anchorHint))
        ? anchorHint : first;
      if (anchor === null || !nodeIds.has(anchor)) anchor = hint;
      if (activeCursor === null || !nodeIds.has(activeCursor)) activeCursor = hint;
      initialReconcileDone = true;
    },
    addIds: function(ids) {
      if (!ids || ids.length === 0) return;
      clearColumnAxis();
      var wasEmpty = nodeIds.size === 0;
      for (var i = 0; i < ids.length; i++) nodeIds.add(ids[i]);
      if (wasEmpty) { anchor = ids[0]; activeCursor = ids[0]; }
      initialReconcileDone = true;
    },
    /* Z12 — symmetric bulk remove. Drops every id in ids and falls
     * the cursor/anchor back to the anchor (when still present) or the
     * first surviving id; clears on empty. Mirror of
     * GridSelectionModel.removeIds in grid-selection.ts. */
    removeIds: function(ids) {
      if (!ids || ids.length === 0) return;
      var changed = false;
      for (var i = 0; i < ids.length; i++) {
        if (nodeIds.delete(ids[i])) changed = true;
      }nitialReconcileDone = true;
      i
      if (!changed) return;
      if (nodeIds.size === 0) { clearInternal(); return; }
      var cursorSurvived = activeCursor !== null && nodeIds.has(activeCursor);
      var anchorSurvived = anchor !== null && nodeIds.has(anchor);
      if (!cursorSurvived) {
        activeCursor = anchorSurvived ? anchor : nodeIds.values().next().value;
      }
      if (!anchorSurvived) anchor = activeCursor;
    },
    /* Z9 — capture fingerprints for current selection; preserves
     * already-captured values (selection-time semantics). */
    captureFingerprints: function(freshMap) {
      var next = new Map();
      var it = nodeIds.values();
      var step = it.next();
      while (!step.done) {
        var id = step.value;
        if (fingerprints.has(id)) next.set(id, fingerprints.get(id));
        else if (freshMap && freshMap.has && freshMap.has(id)) next.set(id, freshMap.get(id));
        step = it.next();
      }
      fingerprints = next;
    },
    getFingerprints: function() { return new Map(fingerprints); },
    reconcile: function(existingIds, fallbackFirstVisibleId) {
      /* Z5c: existingIds is doc-ordered; keep surviving ids in that order. */
      var existingArr = Array.isArray(existingIds)
        ? existingIds
        : Array.from(existingIds);
      var existingSet = new Set(existingArr);
      var survivingOrdered = [];
      for (var ei = 0; ei < existingArr.length; ei++) {
        if (nodeIds.has(existingArr[ei])) survivingOrdered.push(existingArr[ei]);
      }
      if (survivingOrdered.length === 0) {
        /* D0.1 — first reconcile on a fresh doc: stay empty. */
        if (!initialReconcileDone) {
          clearInternal();
          initialReconcileDone = true;
          return;
        }
        if (fallbackFirstVisibleId !== null && fallbackFirstVisibleId !== undefined) {
          nodeIds = new Set([fallbackFirstVisibleId]);
          anchor = fallbackFirstVisibleId;
          activeCursor = fallbackFirstVisibleId;
          fingerprints = new Map();
        } else { clearInternal(); }
        initialReconcileDone = true;
        return;
      }
      nodeIds = new Set(survivingOrdered);
      /* Prune fingerprints for dropped ids. */
      var nextFp = new Map();
      for (var si = 0; si < survivingOrdered.length; si++) {
        if (fingerprints.has(survivingOrdered[si])) {
          nextFp.set(survivingOrdered[si], fingerprints.get(survivingOrdered[si]));
        }
      }
      fingerprints = nextFp;
      var cursorSurvived = activeCursor !== null && existingSet.has(activeCursor);
      var anchorSurvived = anchor !== null && existingSet.has(anchor);
      if (!cursorSurvived) {
        activeCursor = anchorSurvived ? anchor : survivingOrdered[0];
      }
      if (!anchorSurvived) anchor = activeCursor;
      initialReconcileDone = true;
    },
    /* Z9 round-4 re-fix — REMAP-by-fingerprint reconcile. Canonical
     * algorithm in grid-selection.ts reconcileWithFingerprints. */
    reconcileWithFingerprints: function(existingIds, freshMap, fallbackFirstVisibleId) {
      var existingArr = Array.isArray(existingIds)
        ? existingIds : Array.from(existingIds);
      var existingSet = new Set(existingArr);
      var freshFpToId = new Map();
      for (var fi = 0; fi < existingArr.length; fi++) {
        var fid = existingArr[fi];
        var ffp = (freshMap && freshMap.has && freshMap.has(fid))
          ? freshMap.get(fid) : undefined;
        if (ffp === undefined) continue;
        if (!freshFpToId.has(ffp)) freshFpToId.set(ffp, fid);
      }
      var oldFingerprints = fingerprints;
      var newSelection = new Map();
      var addedVia = new Map();
      nodeIds.forEach(function(oldId) {
        var oldFp = oldFingerprints.get(oldId);
        var freshFp = (freshMap && freshMap.has && freshMap.has(oldId))
          ? freshMap.get(oldId) : undefined;
        if (existingSet.has(oldId)) {
          var mismatch = (oldFp !== undefined && freshFp !== undefined
            && oldFp !== freshFp);
          if (!mismatch) {
            if (!newSelection.has(oldId)) {
              newSelection.set(oldId, oldFp !== undefined ? oldFp : freshFp);
              addedVia.set(oldId, 'identity');
            }
            return;
          }
        }
        if (oldFp !== undefined && freshFpToId.has(oldFp)) {
          var freshId = freshFpToId.get(oldFp);
          if (!newSelection.has(freshId) || addedVia.get(freshId) === 'remap') {
            newSelection.set(freshId, oldFp);
            if (!addedVia.has(freshId)) addedVia.set(freshId, 'remap');
          }
        }
      });
      var survivingOrdered = [];
      for (var si = 0; si < existingArr.length; si++) {
        if (newSelection.has(existingArr[si])) survivingOrdered.push(existingArr[si]);
      }
      function remapOne(oldId) {
        if (oldId === null || oldId === undefined) return null;
        if (newSelection.has(oldId)) return oldId;
        var ofp = oldFingerprints.get(oldId);
        if (ofp !== undefined && freshFpToId.has(ofp)) {
          var fid2 = freshFpToId.get(ofp);
          if (newSelection.has(fid2)) return fid2;
        }
        return null;
      }
      if (survivingOrdered.length === 0) {
        /* D0.1 — first reconcile on a fresh doc: stay empty. */
        if (!initialReconcileDone) {
          clearInternal();
          initialReconcileDone = true;
          return;
        }
        if (fallbackFirstVisibleId !== null && fallbackFirstVisibleId !== undefined) {
          nodeIds = new Set([fallbackFirstVisibleId]);
          anchor = fallbackFirstVisibleId;
          activeCursor = fallbackFirstVisibleId;
          fingerprints = new Map();
          if (freshMap && freshMap.has && freshMap.has(fallbackFirstVisibleId)) {
            fingerprints.set(fallbackFirstVisibleId, freshMap.get(fallbackFirstVisibleId));
          }
        } else { clearInternal(); }
        initialReconcileDone = true;
        return;
      }
      nodeIds = new Set(survivingOrdered);
      var nextFp = new Map();
      for (var sj = 0; sj < survivingOrdered.length; sj++) {
        var sid = survivingOrdered[sj];
        var sfp = newSelection.get(sid);
        if (sfp !== undefined) nextFp.set(sid, sfp);
        else if (freshMap && freshMap.has && freshMap.has(sid)) {
          nextFp.set(sid, freshMap.get(sid));
        }
      }
      fingerprints = nextFp;
      initialReconcileDone = true;
      var newCursor = remapOne(activeCursor);
      if (newCursor === null) newCursor = remapOne(anchor);
      if (newCursor === null) newCursor = survivingOrdered[0];
      var newAnchor = remapOne(anchor);
      if (newAnchor === null) newAnchor = newCursor;
      activeCursor = newCursor;
      anchor = newAnchor;
    },
    toJSON: toJSON,
  };
}
`;
