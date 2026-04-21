/**
 * Grid webview inline script body. Wires mouse + keyboard bindings
 * through the selection model; controller + selection twins live in
 * mouse-bindings-webview-js.ts (see banner there for canonical sources
 * the twin mirrors). The panel embeds this string inside a
 * `<script nonce="...">` tag.
 */
import { GRID_MOUSE_BINDINGS_JS } from './mouse-bindings-webview-js';
import { GRID_PICK_INNERMOST_JS } from './pick-innermost-webview-js';

export const GRID_VIEW_WEBVIEW_SCRIPT = `
(function() {
  const vscode = acquireVsCodeApi();
  ${GRID_MOUSE_BINDINGS_JS}
  ${GRID_PICK_INNERMOST_JS}

  const container = document.getElementById('grid-container');
  const gridController = __installGridController(container, vscode);

  /* Batch +/- operates only on rows currently in the DOM. */
  var BATCH_TOGGLE_VISIBLE_ONLY = true;

  function isRowInDom(nodeId) {
    return !!container.querySelector(
      '.g-row[data-node-id="' + CSS.escape(nodeId) + '"]'
    );
  }

  /* B.6 second-round Issue Y discriminator: a row is a TABLE DATA ROW
   * iff its DOM element has class 'r-trow' but NOT 't-header'. Header
   * rows have no data-node-id so they never reach a selection anyway,
   * but the guard keeps the predicate honest. */
  function isTableDataRow(nodeId) {
    var el = container.querySelector(
      '.g-row[data-node-id="' + CSS.escape(nodeId) + '"]'
    );
    if (!el) return false;
    return el.classList.contains('r-trow') && !el.classList.contains('t-header');
  }

  /* Snapshot of the cell-toggle chevrons inside one table row, used by
   * collectCellChildIdsToFlip below. Returns one entry per chevron with
   * the child element id and current expansion state read from the
   * data-expanded attribute. */
  function getRowCellChevrons(rowId) {
    var el = container.querySelector(
      '.g-row[data-node-id="' + CSS.escape(rowId) + '"]'
    );
    if (!el) return [];
    var chevrons = el.querySelectorAll('.expand-toggle.cell-toggle');
    var out = [];
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

  /* Pure helpers (twins of grid-view/scripts/batch-expand-helpers.ts —
   * the canonical TS unit-tested versions). */
  function partitionByTableRow(ids) {
    var treeIds = [];
    var tableRowIds = [];
    for (var i = 0; i < ids.length; i++) {
      if (isTableDataRow(ids[i])) tableRowIds.push(ids[i]);
      else treeIds.push(ids[i]);
    }
    return { treeIds: treeIds, tableRowIds: tableRowIds };
  }
  function collectCellChildIdsToFlip(tableRowIds, direction) {
    var out = [];
    for (var i = 0; i < tableRowIds.length; i++) {
      var chevrons = getRowCellChevrons(tableRowIds[i]);
      for (var j = 0; j < chevrons.length; j++) {
        var ch = chevrons[j];
        if (direction === '+' && !ch.isExpanded) out.push(ch.childId);
        else if (direction === '-' && ch.isExpanded) out.push(ch.childId);
      }
    }
    return out;
  }

  /* Z1 / Z2 — snapshot every renderable id (.g-row[data-node-id]) in
   * document order. Compared BEFORE/AFTER a batch '+' to compute the
   * newly-revealed id delta that the selection grows into (attributes,
   * #group headers, .r-trow rows, comments — everything the DOM shows). */
  function snapshotAllRowIds() {
    var rows = container.querySelectorAll('.g-row[data-node-id]');
    var ids = [];
    for (var i = 0; i < rows.length; i++) {
      var rid = rows[i].getAttribute('data-node-id');
      if (rid) ids.push(rid);
    }
    return ids;
  }

  /* DOM-ordered + deduped [data-column-id] cells sharing a prefix. */
  function orderedColumnIdsFor(columnId) {
    var marker = columnId.indexOf('#col/');
    var prefix = marker >= 0 ? columnId.substring(0, marker + 5) : '';
    var nodes = container.querySelectorAll('[data-column-id]');
    var seen = {};
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var cid = nodes[i].getAttribute('data-column-id');
      if (!cid || seen[cid]) continue;
      if (prefix !== '' && cid.indexOf(prefix) !== 0) continue;
      seen[cid] = true; out.push(cid);
    }
    return out;
  }  function computeIdDelta(before, after) {
    var oldSet = new Set(before);
    var out = [];
    for (var i = 0; i < after.length; i++) {
      if (!oldSet.has(after[i])) out.push(after[i]);
    }
    return out;
  }

  /* Z3 / Z7 — DOM walker lives in pick-innermost-webview-js.ts; see
   * __pickInnermostExpandedFromDom(container, treeIds). */
  function pickInnermostExpandedFromDom(treeIds) {
    return __pickInnermostExpandedFromDom(container, treeIds);
  }

  /* Pending growth state — set when the +/- handler posts a
   * batchToggleExpand. Stores the pre-batch snapshot of renderable ids.
   * After the host's updateTreeData re-render, the delta (new - old)
   * joins the selection (Issue X / Z1). Cleared after every consumption
   * or after any non-growth re-render. */
  var pendingGrowthSnapshot = null;

  /** Get all selectable node elements in DOM order.
   *  Excludes r-comment rows -- comments are structural / non-editable
   *  and should not participate in arrow-key navigation. */
  function getSelectableNodes() {
    return Array.from(document.querySelectorAll(
      '#grid-container .g-row[data-node-id]:not(.r-comment)'
    ));
  }

  /** Full list of row node ids in DOM order, INCLUDING comment rows.
   *  Used for Shift-range keyboard extensions so comment rows can be
   *  part of a multi-row selection (Q2 in DESIGN_GRID_MULTI_SELECT). */
  function getAllRowNodeIds() {
    var rows = document.querySelectorAll('#grid-container .g-row[data-node-id]');
    var ids = [];
    for (var i = 0; i < rows.length; i++) {
      var rid = rows[i].getAttribute('data-node-id');
      if (rid) ids.push(rid);
    }
    return ids;
  }

  /** Index of the active cursor in the given ordered id list. */
  function indexOfCursor(orderedIds) {
    var cursor = gridController.getActiveCursor();
    if (!cursor) return -1;
    return orderedIds.indexOf(cursor);
  }

  /** Keyboard-navigate to a single node (single-select semantics for now;
   *  B.6.c will extend this with Shift/Ctrl to use the controller). */
  function navigateTo(nodes, idx) {
    if (idx < 0 || idx >= nodes.length) { return; }
    const el = nodes[idx];
    const nodeId = el.getAttribute('data-node-id');
    const nodeType = el.getAttribute('data-node-type') || 'element';
    gridController.setSingle(nodeId);
    vscode.postMessage({ type: 'nodeSelected', nodeId: nodeId, nodeType: nodeType });
  }

  /** Find index of the active cursor row in the visible list. */
  function findCurrentIndex(nodes) {
    const cursor = gridController.getActiveCursor();
    if (!cursor) { return -1; }
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute('data-node-id') === cursor) { return i; }
    }
    return -1;
  }

  /** Find parent node element via DOM traversal in flat grid */
  function findParentNodeElement(el) {
    var row = el.closest('.g-row');
    if (!row) { return null; }
    /* For table data rows, parent is the preceding table label */
    if (row.classList.contains('r-trow')) {
      var prev = row.previousElementSibling;
      while (prev) {
        if (prev.classList.contains('r-tregion-label')) { return prev; }
        if (!prev.classList.contains('r-trow')) { break; }
        prev = prev.previousElementSibling;
      }
      return null;
    }
    /* For tree rows, walk backwards to find first row with lower depth */
    var depth = parseInt(row.style.getPropertyValue('--depth') || '0');
    if (depth === 0) { return null; }
    var prev = row.previousElementSibling;
    while (prev) {
      if (prev.classList.contains('g-row')) {
        var prevDepth = parseInt(prev.style.getPropertyValue('--depth') || '0');
        if (prevDepth < depth) { return prev; }
      }
      prev = prev.previousElementSibling;
    }
    return null;
  }

  /* Click delegation: chevron/expand-toggle clicks short-circuit
   * before any selection change. Comment rows can be Ctrl/Shift-
   * targeted; plain click on a comment is inert (controller). */
  container.addEventListener('click', function(e) {
    /* Toggle-strip icons (table-mode / flip): intercepted first so the
     * click never changes selection. */
    const toggleIcon = e.target.closest('.toggle-icon');
    if (toggleIcon) {
      e.preventDefault();
      e.stopPropagation();
      const parentNodeId = toggleIcon.getAttribute('data-parent-node-id');
      const action = toggleIcon.getAttribute('data-action');
      const currentlyOn = toggleIcon.getAttribute('data-state') === 'on';
      if (parentNodeId && action) {
        const kind = action === 'toggle-table-mode' ? 'tableMode' : 'flip';
        vscode.postMessage({
          type: 'toggleStateChanged',
          parentNodeId: parentNodeId,
          kind: kind, value: !currentlyOn,
        });
      }
      return;
    }
    const toggle = e.target.closest('.expand-toggle');
    if (toggle) {
      const nodeId = toggle.getAttribute('data-node-id');
      if (nodeId) { vscode.postMessage({ type: 'toggleExpand', nodeId: nodeId }); }
      return;
    }
  /* Row-click targets that are NOT .g-row wrappers (e.g. the numeric
   * t-th cells in a flipped table header). Checked before columns. */
    const rowClickCell = e.target.closest('[data-row-click-id]');
    if (rowClickCell) {
      const rowClickId = rowClickCell.getAttribute('data-row-click-id');
      if (rowClickId) {
        // Flipped-mode headers expose original rows via data-row-click-id
        // only (the g-row wrappers for those originals are NOT emitted).
        // Shift-click must build an ordered list from DOM-order of all
        // row-click cells in the same flipped header so range selection
        // works when there is no g-row anchor to interpolate between.
        if (e.shiftKey) {
          const anchor = rowClickCell.closest('.r-flipped') || container;
          const orderedRowClickIds = Array.from(
            anchor.querySelectorAll('[data-row-click-id]'),
          )
            .map(function(n) { return n.getAttribute('data-row-click-id'); })
            .filter(function(x) { return !!x; });
          gridController.extendRangeTo(rowClickId, orderedRowClickIds);
          return;
        }
        gridController.onRowClick(rowClickId, {
          ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey,
        });
        return;
      }
    }
    /* Column-header click: dispatches to onColumnClick. */
    const colCell = e.target.closest('[data-column-id]');
    if (colCell) {
      const columnId = colCell.getAttribute('data-column-id');
      if (columnId) {
        gridController.onColumnClick(columnId, orderedColumnIdsFor(columnId), {
          ctrl: e.ctrlKey || e.metaKey,
          shift: e.shiftKey,
        });
        return;
      }
    }
    const nodeEl = e.target.closest('.g-row[data-node-id]');
    if (!nodeEl) { return; }
    const nodeId = nodeEl.getAttribute('data-node-id');
    if (!nodeId) { return; }
    gridController.onRowClick(nodeId, {
      ctrl: e.ctrlKey || e.metaKey,
      shift: e.shiftKey,
    });
  });

  /* --- Keyboard navigation (single-cursor + B.6.c multi-select) --- */
  document.addEventListener('keydown', function(e) {
    /* B.1.h — column-axis keyboard: Shift+Left/Right extends range;
     * Escape + plain Up/Down clear axes (TODO: re-enter row axis). */
    var colSnap = gridController.getSelectionSnapshot();
    if (colSnap && colSnap.columnIds && colSnap.columnIds.length > 0
        && colSnap.columnActiveCursor) {
      var plain = !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (plain && (e.key === 'Escape' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        gridController.clearSelection();
        return;
      }
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
          && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        var ordered = orderedColumnIdsFor(colSnap.columnActiveCursor);
        if (ordered.length > 0) {
          e.preventDefault();
          gridController.extendColumnCursor(e.key === 'ArrowLeft' ? -1 : 1, ordered);
          return;
        }
      }
    }

    /* B.6.c: Ctrl+A / Cmd+A — select every visible row. Must bail out
     * when the user is typing in a cell editor so the normal "select all
     * text in the input" behaviour is preserved. */
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey
        && (e.key === 'a' || e.key === 'A')) {
      if (__isInEditableContext(e.target)) { return; }
      e.preventDefault();
      var allIds = getAllRowNodeIds();
      if (allIds.length > 0) { gridController.selectAllVisible(allIds); }
      return;
    }

    /* Escape fully clears the current row selection — restores the
     * empty state (size=0 anchor=null cursor=null) so the user can
     * start over with a fresh click. Column-axis escape is handled by
     * the earlier column-axis block. */
    if (e.key === 'Escape' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      var snap = gridController.getSelectionSnapshot();
      if (snap && snap.nodeIds && snap.nodeIds.length > 0) {
        e.preventDefault();
        gridController.clearSelection();
        return;
      }
    }

    /* B.6.c: Shift+Arrow / Shift+Home / Shift+End extend the range using
     * the full ordered id list (comments INCLUDED — Q2). */
    if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
        && (e.key === 'ArrowUp' || e.key === 'ArrowDown'
            || e.key === 'Home' || e.key === 'End')) {
      var all = getAllRowNodeIds();
      if (all.length === 0) { return; }
      var cur = indexOfCursor(all);
      var targetIdx;
      if (e.key === 'ArrowUp') {
        targetIdx = cur < 0 ? 0 : Math.max(0, cur - 1);
      } else if (e.key === 'ArrowDown') {
        targetIdx = cur < 0 ? 0 : Math.min(all.length - 1, cur + 1);
      } else if (e.key === 'Home') {
        targetIdx = 0;
      } else {
        targetIdx = all.length - 1;
      }
      e.preventDefault();
      gridController.extendRangeTo(all[targetIdx], all);
      return;
    }

    const nodes = getSelectableNodes();
    if (nodes.length === 0) { return; }
    const idx = findCurrentIndex(nodes);
    const cursor = gridController.getActiveCursor();

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        navigateTo(nodes, idx > 0 ? idx - 1 : 0);
        break;

      case 'ArrowDown':
        e.preventDefault();
        navigateTo(nodes, idx < 0 ? 0 : Math.min(idx + 1, nodes.length - 1));
        break;

      case 'ArrowLeft': {
        e.preventDefault();
        if (idx < 0) { break; }
        const el = nodes[idx];
        const toggle = el.querySelector('.expand-toggle');
        if (toggle && toggle.getAttribute('data-expanded') === 'true') {
          vscode.postMessage({ type: 'toggleExpand', nodeId: cursor });
        } else {
          const parent = findParentNodeElement(el);
          if (parent) {
            const pid = parent.getAttribute('data-node-id');
            const ptype = parent.getAttribute('data-node-type') || 'element';
            gridController.setSingle(pid);
            vscode.postMessage({ type: 'nodeSelected', nodeId: pid, nodeType: ptype });
          }
        }
        break;
      }

      case 'ArrowRight': {
        e.preventDefault();
        if (idx < 0) { break; }
        const el = nodes[idx];
        const toggle = el.querySelector('.expand-toggle');
        if (toggle && toggle.getAttribute('data-expanded') === 'false') {
          vscode.postMessage({ type: 'toggleExpand', nodeId: cursor });
        } else if (toggle && toggle.getAttribute('data-expanded') === 'true') {
          if (idx < nodes.length - 1) { navigateTo(nodes, idx + 1); }
        }
        break;
      }

      case '+':
      case '=':
        {
          /* Z4 — route EVERY +/- press through the batch path (single-row
           * included) so the growth pass fires on a single selected
           * parent too. Single-row on a LEAF falls out naturally: no
           * expandable ids → nothing posted → no growth. */
          var snapPlus = gridController.getSelectionSnapshot();
          if (snapPlus && snapPlus.nodeIds && snapPlus.nodeIds.length > 0) {
            var idsPlus = snapPlus.nodeIds;
            if (BATCH_TOGGLE_VISIBLE_ONLY) {
              idsPlus = idsPlus.filter(isRowInDom);
            }
            var partPlus = partitionByTableRow(idsPlus);
            var cellsPlus = collectCellChildIdsToFlip(partPlus.tableRowIds, '+');
            var hostIdsPlus = partPlus.treeIds.concat(cellsPlus);
            if (hostIdsPlus.length > 0) {
              e.preventDefault();
              /* Z1/Z2 — snapshot renderable ids BEFORE the host
               * re-renders so we can compute the delta. */
              pendingGrowthSnapshot = snapshotAllRowIds();
              vscode.postMessage({
                type: 'batchToggleExpand',
                direction: '+',
                nodeIds: hostIdsPlus,
              });
            }
          }
        }
        break;

      case '-':
        {
          var snapMinus = gridController.getSelectionSnapshot();
          if (snapMinus && snapMinus.nodeIds && snapMinus.nodeIds.length > 0) {
            var idsMinus = snapMinus.nodeIds;
            if (BATCH_TOGGLE_VISIBLE_ONLY) {
              idsMinus = idsMinus.filter(isRowInDom);
            }
            var partMinus = partitionByTableRow(idsMinus);
            /* Z3 — symmetric with '+': collapse only the INNERMOST
             * expanded rows so each '-' press undoes one '+' press. */
            var innermostTree = pickInnermostExpandedFromDom(partMinus.treeIds);
            pendingGrowthSnapshot = null;
            var cellsMinus = collectCellChildIdsToFlip(partMinus.tableRowIds, '-');
            var hostIdsMinus = innermostTree.concat(cellsMinus);
            if (hostIdsMinus.length > 0) {
              e.preventDefault();
              vscode.postMessage({
                type: 'batchToggleExpand',
                direction: '-',
                nodeIds: hostIdsMinus,
              });
            }
          }
        }
        break;

      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          navigateTo(nodes, idx > 0 ? idx - 1 : 0);
        } else {
          navigateTo(nodes, idx < 0 ? 0 : Math.min(idx + 1, nodes.length - 1));
        }
        break;
    }
  });

  /* --- Messages from extension host --- */
  window.addEventListener('message', function(event) {
    const message = event.data;
    switch (message.type) {
      case 'updateTreeData': {
        if (container && message.html) {
          container.innerHTML = message.html;
          /* Z1/Z2 — grow the selection into the delta between the
           * pre-batch snapshot and the just-rendered DOM. Covers every
           * newly-revealed id kind (attributes, #group, .r-trow,
           * comments, text rows). MUST happen BEFORE reapply so the
           * new ids get the .selected class in the same DOM pass. */
          if (pendingGrowthSnapshot !== null) {
            var after = snapshotAllRowIds();
            var grow = computeIdDelta(pendingGrowthSnapshot, after);
            pendingGrowthSnapshot = null;
            if (grow.length > 0 && gridController.growSelection) {
              gridController.growSelection(grow);
            } else {
              /* DOM was rebuilt; re-apply current selection classes. */
              gridController.reapply();
            }
          } else {
            /* DOM was rebuilt; re-apply current selection classes. */
            gridController.reapply();
          }
        }
        break;
      }
      case 'selectNode': {
        if (message.nodeId) { gridController.setSingle(message.nodeId); }
        break;
      }
      case 'reconcileSelection': {
        /* Q4 / Z9: host computed new existingIds + per-id fingerprints
         * after a re-render. Prefer the fingerprint path when a
         * fingerprint object arrived — drops ids whose path still
         * exists but whose content changed. */
        var ids = Array.isArray(message.existingIds) ? message.existingIds : [];
        var fallback = message.fallbackFirstVisibleId == null
          ? null : message.fallbackFirstVisibleId;
        var fpObj = (message && typeof message.fingerprints === 'object'
          && message.fingerprints !== null) ? message.fingerprints : null;
        if (fpObj) {
          var fpMap = new Map();
          for (var k in fpObj) {
            if (Object.prototype.hasOwnProperty.call(fpObj, k)) fpMap.set(k, fpObj[k]);
          }
          if (gridController.setLatestFingerprints) {
            gridController.setLatestFingerprints(fpMap);
          }
          if (gridController.reconcileWithFingerprints) {
            gridController.reconcileWithFingerprints(ids, fallback);
          } else {
            gridController.reconcile(ids, fallback);
          }
        } else {
          gridController.reconcile(ids, fallback);
        }
        break;
      }
    }
  });
})();
`;
