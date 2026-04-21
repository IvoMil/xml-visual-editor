/**
 * Inline JS twin of GridMouseController for the webview runtime — the
 * controller half of the mouse-bindings twin pair. This project has no
 * bundler (pure `tsc`), and the webview script is embedded as a string
 * in grid-view-panel.ts, so real imports into the webview are not
 * possible.
 *
 * The selection-model half (`__mkSelection()`) lives in a sibling file
 * (mouse-bindings-webview-selection-js.ts) to keep every source file
 * under the project's 500-line ceiling. This module concatenates the
 * two twins into the single `GRID_MOUSE_BINDINGS_JS` export so the
 * emitted `<script>` body is byte-equivalent to the pre-split version.
 *
 * Despite the historical "mouse-bindings" file name, this twin now also
 * exposes keyboard-driven selection primitives — Shift-Arrow /
 * Shift-Home / Shift-End range extension, Escape collapse-to-cursor, and
 * Ctrl+A / Cmd+A select-all-visible. Renaming the file is deferred to
 * minimise churn across the webview wiring; the canonical TS source in
 * mouse-bindings-controller.ts carries the same dual-role note.
 *
 * CANONICAL SOURCES (keep in sync — any semantic change must be mirrored):
 *   - vscode-extension/src/grid-view/model/grid-selection.ts
 *   - vscode-extension/src/grid-view/scripts/mouse-bindings-controller.ts
 *
 * The canonical TypeScript versions are covered by unit tests. This
 * file is therefore intentionally behaviour-equivalent and kept minimal.
 *
 * The script below defines `window.__xmlGridController` via
 * `installGridController(container, vscode)` and exposes:
 *   - installGridController(container, vscode) -> { controller }
 * The returned controller has onRowClick / reconcile / setSingle /
 * extendRangeTo / collapseToCursor / selectAllVisible /
 * getActiveCursor / getSelectionSnapshot methods used by the outer
 * webview script for keyboard + host-message wiring.
 */
import { GRID_MOUSE_BINDINGS_SELECTION_JS } from './mouse-bindings-webview-selection-js';

const GRID_MOUSE_BINDINGS_CONTROLLER_JS = String.raw`
/* ---- DOM adapter + GridMouseController twin ---- */
function __installGridController(container, vscode) {
  var selection = __mkSelection();
  /* Latest fingerprint map from host (set on each reconcileSelection
   * message). Controller captures from this after every mutation so
   * newly-added ids have a baseline fingerprint. */
  var latestFingerprints = new Map();

  function getRowIds() {
    var rows = container.querySelectorAll('.g-row[data-node-id]');
    var ids = [];
    for (var i = 0; i < rows.length; i++) {
      var rid = rows[i].getAttribute('data-node-id');
      if (rid) ids.push(rid);
    }
    return ids;
  }
  function isComment(nodeId) {
    var el = container.querySelector(
      '.g-row[data-node-id="' + CSS.escape(nodeId) + '"]'
    );
    return !!(el && el.classList.contains('r-comment'));
  }
  function getNodeType(nodeId) {
    var el = container.querySelector(
      '.g-row[data-node-id="' + CSS.escape(nodeId) + '"]'
    );
    return (el && el.getAttribute('data-node-type')) || 'element';
  }
  /* Read the row's own expand-toggle state. Mirrors the canonical
   * GridView.isRowExpanded. Uses the scoped child query first so a
   * header's own chevron wins over any cell chevron inside a table
   * region rendered below. */
  function isRowExpandedById(nodeId) {
    var el = container.querySelector(
      '.g-row[data-node-id="' + CSS.escape(nodeId) + '"]'
    );
    if (!el) return false;
    var t = el.querySelector(':scope > .c-name > .expand-toggle');
    if (!t) t = el.querySelector(':scope > .expand-toggle');
    if (!t) t = el.querySelector('.expand-toggle');
    return !!(t && t.getAttribute('data-expanded') === 'true');
  }
  /* Collect visible descendant ids in DOM order.
   *  - Ordinary expanded element headers: children are at depth+1 so
   *    we walk forward including any g-row with data-depth strictly
   *    greater than the clicked depth and stop on the first row at
   *    depth <= clicked depth.
   *  - Synthesized #group table-region headers: the r-trow data rows
   *    (and the t-header row that has no data-node-id) sit at the
   *    SAME data-depth as the #group header. When the clicked row id
   *    ends with #group, include following r-trow rows at the same
   *    depth and stop on the first non-r-trow row at the same (or
   *    lower) depth.
   * Returns [] when the row is a leaf or collapsed (no matching rows).
   */
  function getVisibleDescendantIds(nodeId) {
    var el = container.querySelector(
      '.g-row[data-node-id="' + CSS.escape(nodeId) + '"]'
    );
    if (!el) return [];
    var rootDepth = parseInt(el.getAttribute('data-depth') || '0', 10);
    var isGroupHeader = typeof nodeId === 'string'
      && nodeId.length >= 6
      && nodeId.lastIndexOf('#group') === nodeId.length - 6;
    var out = [];
    var cursor = el.nextElementSibling;
    while (cursor) {
      if (cursor.classList && cursor.classList.contains('g-row')) {
        var cd = parseInt(cursor.getAttribute('data-depth') || '0', 10);
        if (cd < rootDepth) break;
        if (cd === rootDepth) {
          /* Keep walking across the table region only when the
           * clicked row is a #group header AND the current sibling is
           * a table-region row (r-trow covers both the t-header
           * column-labels row and the data rows). */
          if (!(isGroupHeader && cursor.classList.contains('r-trow'))) break;
          var cid = cursor.getAttribute('data-node-id');
          if (cid) out.push(cid);
        } else {
          /* cd > rootDepth — ordinary descendant. */
          var cid2 = cursor.getAttribute('data-node-id');
          if (cid2) out.push(cid2);
        }
      }
      cursor = cursor.nextElementSibling;
    }
    return out;
  }
  function applySelection(snap) {
    var selSet = new Set(snap.nodeIds);
    var colSet = new Set(snap.columnIds || []);
    var cursor = snap.activeCursor;
    var rows = container.querySelectorAll('.g-row[data-node-id]');
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].getAttribute('data-node-id');
      if (selSet.has(id)) rows[i].classList.add('selected');
      else rows[i].classList.remove('selected');
      if (id === cursor) rows[i].classList.add('cursor');
      else rows[i].classList.remove('cursor');
    }
    /* Column-axis paint. Every element carrying data-column-id is
     * eligible: a flipped-row wrapper (.g-row) takes .selected when
     * the column is selected (axis swap in flip mode), a header cell
     * takes .column-selected. Elements that are neither (defensive)
     * are left untouched. */
    var colEls = container.querySelectorAll('[data-column-id]');
    for (var c = 0; c < colEls.length; c++) {
      var cid = colEls[c].getAttribute('data-column-id');
      var active = cid !== null && colSet.has(cid);
      var isWrapper = colEls[c].classList.contains('g-row');
      if (isWrapper) {
        if (active) colEls[c].classList.add('selected');
        else colEls[c].classList.remove('selected');
      } else {
        if (active) colEls[c].classList.add('column-selected');
        else colEls[c].classList.remove('column-selected');
      }
    }
    /* Data cells in the UNFLIPPED view carry data-cell-column-id
     * (their original column id). Paint .column-selected on every
     * such cell whose column is in the column-axis selection. These
     * cells deliberately do NOT carry data-column-id so they are not
     * click-targets for column selection — only header cells are. */
    var dataColEls = container.querySelectorAll('[data-cell-column-id]');
    for (var dc = 0; dc < dataColEls.length; dc++) {
      var dcid = dataColEls[dc].getAttribute('data-cell-column-id');
      if (dcid !== null && colSet.has(dcid)) {
        dataColEls[dc].classList.add('column-selected');
      } else {
        dataColEls[dc].classList.remove('column-selected');
      }
    }
    /* Data cells in the FLIPPED view carry data-flip-row-id (the
     * ORIGINAL row id for the visual column they occupy). When that
     * row is in the row-axis selection, the cell is visually part of
     * the selected column → paint .column-selected. The numeric
     * header cells also carry data-row-click-id and are painted
     * .selected below. */
    var flipRowEls = container.querySelectorAll('[data-flip-row-id]');
    for (var fr = 0; fr < flipRowEls.length; fr++) {
      var frid = flipRowEls[fr].getAttribute('data-flip-row-id');
      if (frid !== null && selSet.has(frid)) {
        flipRowEls[fr].classList.add('column-selected');
      } else {
        flipRowEls[fr].classList.remove('column-selected');
      }
    }
    /* Row-click cells that are not .g-row wrappers (e.g. the numeric
     * t-th header cells of a flipped table). Paint .selected when the
     * underlying row id is in the row-axis selection. */
    var rowClickEls = container.querySelectorAll('[data-row-click-id]');
    for (var rc = 0; rc < rowClickEls.length; rc++) {
      var rcid = rowClickEls[rc].getAttribute('data-row-click-id');
      if (rcid !== null && selSet.has(rcid)) {
        rowClickEls[rc].classList.add('selected');
      } else {
        rowClickEls[rc].classList.remove('selected');
      }
    }
    if (cursor) {
      var cEl = container.querySelector(
        '.g-row[data-node-id="' + CSS.escape(cursor) + '"]'
      );
      if (cEl) {
        var cell = cEl.querySelector('.g-cell, .t-cell');
        if (cell) cell.scrollIntoView({ block: 'nearest' });
        else cEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }
  function captureFp() {
    try { selection.captureFingerprints(latestFingerprints); } catch (e) {}
  }
  function broadcast() {
    captureFp();
    var snap = selection.toJSON();
    applySelection(snap);
    vscode.postMessage({
      type: 'selectionChanged',
      selection: snap,
      activeNodeType: snap.activeCursor === null ? null : getNodeType(snap.activeCursor),
    });
    if (snap.activeCursor !== null) {
      vscode.postMessage({
        type: 'nodeSelected',
        nodeId: snap.activeCursor,
        nodeType: getNodeType(snap.activeCursor),
      });
    }
  }

  return {
    onRowClick: function(nodeId, mods) {
      var plain = !mods.ctrl && !mods.shift;
      if (plain) {
        selection.replaceWith(nodeId);
        /* Plain click auto-grow trigger is DOM-based: we include the
         * visible descendants whenever the walk returns a non-empty
         * list. This covers ordinary expanded element headers AND
         * synthesized #group table-region headers. */
        var desc = getVisibleDescendantIds(nodeId);
        if (desc.length > 0) selection.addIds(desc);
      } else if (mods.ctrl) {
        /* Symmetric "toggle subtree" for expanded headers: union-add
         * header + visible descendants on add, bulk-remove header +
         * visible descendants on remove. Leaves and collapsed
         * headers fall back to single-id toggle. */
        var wasSelected = selection.has(nodeId);
        var cdesc = getVisibleDescendantIds(nodeId);
        if (wasSelected && cdesc.length > 0) {
          var toRemove = [nodeId];
          for (var i = 0; i < cdesc.length; i++) toRemove.push(cdesc[i]);
          selection.removeIds(toRemove);
        } else {
          selection.toggle(nodeId);
          if (!wasSelected && cdesc.length > 0) selection.addIds(cdesc);
        }
      } else {
        selection.extendRangeTo(nodeId, getRowIds());
      }
      broadcast();
      return true;
    },
    reapply: function() { applySelection(selection.toJSON()); },
    setLatestFingerprints: function(map) { latestFingerprints = map || new Map(); },
    captureFingerprints: captureFp,
    reconcile: function(existingIds, fallback) {
      selection.reconcile(existingIds, fallback == null ? null : fallback);
      applySelection(selection.toJSON());
    },
    /* Reconcile using the latest host fingerprint map. After the
     * reconcile, re-apply the snapshot to the DOM. If the selection
     * collapsed to a single expanded row, run the auto-grow walk so
     * the branch-selection survives the rebuild. */
    reconcileWithFingerprints: function(existingIds, fallback) {
      selection.reconcileWithFingerprints(
        existingIds,
        latestFingerprints,
        fallback == null ? null : fallback,
      );
      /* Persistence across reconcile — single-id selection on an
       * expanded row re-grows the branch. */
      var snap = selection.toJSON();
      if (snap.nodeIds.length === 1 && snap.activeCursor
          && isRowExpandedById(snap.activeCursor)) {
        var desc = getVisibleDescendantIds(snap.activeCursor);
        if (desc.length > 0) {
          selection.addIds(desc);
          captureFp();
        }
      }
      applySelection(selection.toJSON());
    },
    setSingle: function(nodeId) {
      selection.replaceWith(nodeId);
      applySelection(selection.toJSON());
    },
    extendRangeTo: function(nodeId, orderedVisibleIds) {
      selection.extendRangeTo(nodeId, orderedVisibleIds);
      broadcast();
    },
    collapseToCursor: function() {
      if (selection.size === 0) return;
      selection.collapseToCursor();
      broadcast();
    },
    selectAllVisible: function(visibleIds) {
      if (!visibleIds || visibleIds.length === 0) return;
      /* Pass current cursor as anchorHint so it is preserved when
       * still present in the new set. */
      var cur = selection.activeCursor;
      selection.selectAll(visibleIds, cur);
      broadcast();
    },
    growSelection: function(ids) {
      if (!ids || ids.length === 0) return;
      selection.addIds(ids);
      broadcast();
    },
    getActiveCursor: function() { return selection.activeCursor; },
    /* Column-axis twins of GridMouseController. */
    onColumnClick: function(columnId, orderedColumnIds, mods) {
      if (mods && mods.ctrl) {
        selection.toggleColumn(columnId);
      } else if (mods && mods.shift) {
        if (selection.columnAnchor !== null) {
          selection.extendColumnRange(columnId, orderedColumnIds);
        } else {
          selection.selectColumn(columnId);
        }
      } else {
        selection.selectColumn(columnId);
      }
      broadcast();
      return true;
    },
    extendColumnCursor: function(direction, orderedColumnIds) {
      var cur = selection.columnActiveCursor;
      if (cur === null) return;
      var idx = orderedColumnIds.indexOf(cur);
      if (idx === -1) return;
      var targetIdx = Math.max(0, Math.min(orderedColumnIds.length - 1, idx + direction));
      selection.extendColumnRange(orderedColumnIds[targetIdx], orderedColumnIds);
      broadcast();
    },
    clearSelection: function() {
      selection.clear();
      broadcast();
    },
    getSelectionSnapshot: function() { return selection.toJSON(); },
    isRowExpandedById: isRowExpandedById,
    getVisibleDescendantIds: getVisibleDescendantIds,
    /* Twin of GridMouseController.onToggleIconClick. Mirror only. */
    onToggleIconClick: function(parentNodeId, kind, value) {
      vscode.postMessage({
        type: 'toggleStateChanged', parentNodeId: parentNodeId,
        kind: kind, value: value,
      });
    },
  };
}

/* Pure helper mirrored from isInEditableContext() in
 * mouse-bindings-controller.ts — used by the outer webview script to
 * bail Ctrl+A when the user is typing in a cell editor. */
function __isInEditableContext(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return target.closest('input, textarea, [contenteditable="true"]') !== null;
}
`;

/**
 * Composed inline JS: selection twin followed by controller twin. The
 * composition order matters — the controller calls `__mkSelection()`
 * which is defined in the selection twin, so the selection body must
 * appear first in the emitted `<script>`. Each twin is itself a
 * `String.raw` template with a leading and trailing newline; placing
 * them back-to-back via a plain template literal reproduces the blank
 * line that originally separated the two blocks in the single pre-
 * split file, keeping the rendered webview script byte-equivalent.
 */
export const GRID_MOUSE_BINDINGS_JS =
  `${GRID_MOUSE_BINDINGS_SELECTION_JS}${GRID_MOUSE_BINDINGS_CONTROLLER_JS}`;
