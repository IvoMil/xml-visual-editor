/**
 * JS scripts for schema table interactivity — expand/collapse, row selection,
 * insert actions, column toggles, filter, state restore, and message handling.
 */

export function getElementsScript(): string {
  return `const vscode = acquireVsCodeApi();

/* ── Expand / Collapse ────────────────── */
function toggleNode(rowId) {
  const row = document.querySelector('tr[data-id="' + rowId + '"]');
  if (!row) return;
  const arrow = row.querySelector('.arrow');
  if (!arrow || arrow.classList.contains('leaf')) return;

  const isExpanded = arrow.classList.contains('expanded');
  arrow.classList.toggle('expanded');

  const depth = parseInt(row.dataset.depth, 10);
  let sibling = row.nextElementSibling;
  while (sibling) {
    const sd = parseInt(sibling.dataset.depth, 10);
    if (sd <= depth) break;

    if (isExpanded) {
      sibling.classList.add('hidden-row');
      const sa = sibling.querySelector('.arrow');
      if (sa) sa.classList.remove('expanded');
    } else {
      if (sd === depth + 1) sibling.classList.remove('hidden-row');
    }
    sibling = sibling.nextElementSibling;
  }
}

function expandAll() {
  document.querySelectorAll('.arrow').forEach(a => a.classList.add('expanded'));
  document.querySelectorAll('.schema-row').forEach(r => r.classList.remove('hidden-row'));
}

function collapseAll() {
  document.querySelectorAll('.arrow').forEach(a => a.classList.remove('expanded'));
  document.querySelectorAll('.schema-row').forEach(r => {
    if (parseInt(r.dataset.depth, 10) > 0) r.classList.add('hidden-row');
  });
}

/* ── Row selection ────────────────────── */
function selectRow(rowId) {
  document.querySelectorAll('.schema-row.selected').forEach(r => r.classList.remove('selected'));
  const row = document.querySelector('tr[data-id="' + rowId + '"]');
  if (row) {
    row.classList.add('selected');
    const name = row.dataset.name || '';
    const nodeType = row.dataset.nodeType || '';
    vscode.postMessage({ type: 'selectNode', name: name, nodeType: nodeType });
  }
}

/* ── Insert action ────────────────────── */
function insertElement(name, event, compositorInsert) {
  if (event) event.stopPropagation();
  vscode.postMessage({ type: 'insertElement', name: name, compositorInsert: !!compositorInsert });
}

/* ── Column toggles ───────────────────── */
function toggleColumn(col) {
  const cls = 'hide-' + col;
  document.body.classList.toggle(cls);
  const btn = document.getElementById('btn' + col.charAt(0).toUpperCase() + col.slice(1));
  if (btn) btn.classList.toggle('active');
  const state = vscode.getState() || {};
  state['hide_' + col] = document.body.classList.contains(cls);
  vscode.setState(state);
}

/* ── Restore persisted column toggle state ── */
function restoreState() {
  const state = vscode.getState() || {};
  ['doc', 'type'].forEach(col => {
    const hidden = !!state['hide_' + col];
    const cls = 'hide-' + col;
    if (hidden) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    const btn = document.getElementById('btn' + col.charAt(0).toUpperCase() + col.slice(1));
    if (btn) {
      if (hidden) btn.classList.remove('active');
      else btn.classList.add('active');
    }
  });
  // Restore filter visibility and text from state
  var filterBar = document.getElementById('filterBar');
  if (filterBar && state.filterVisible) {
    filterBar.style.display = '';
    document.body.classList.add('filter-visible');
    var input = filterBar.querySelector('input');
    if (input && state.filterText) {
      input.value = state.filterText;
      filterRows(state.filterText);
    }
  }
}

/* ── Filter ───────────────────────────── */
function filterRows(query) {
  var state = vscode.getState() || {};
  state.filterText = query;
  vscode.setState(state);
  var q = query.toLowerCase();
  const rows = Array.from(document.querySelectorAll('.schema-row'));

  if (!q) {
    rows.forEach(r => r.classList.remove('filtered-out'));
    return;
  }

  // First pass: show matching elements, hide compositors initially
  rows.forEach(r => {
    const nodeType = r.dataset.nodeType || '';
    const name = (r.dataset.name || '').toLowerCase();
    const isCompositor = nodeType === 'choice' || nodeType === 'sequence' || nodeType === 'all';

    if (isCompositor) {
      r.classList.add('filtered-out');
    } else if (name.includes(q)) {
      r.classList.remove('filtered-out');
    } else {
      r.classList.add('filtered-out');
    }
  });

  // Second pass (bottom-up): show compositors that have visible descendants
  for (var i = rows.length - 1; i >= 0; i--) {
    var row = rows[i];
    var nodeType = row.dataset.nodeType || '';
    var isCompositor = nodeType === 'choice' || nodeType === 'sequence' || nodeType === 'all';
    if (!isCompositor) continue;

    var depth = parseInt(row.dataset.depth, 10);
    var hasVisibleDescendant = false;
    for (var j = i + 1; j < rows.length; j++) {
      if (parseInt(rows[j].dataset.depth, 10) <= depth) break;
      if (!rows[j].classList.contains('filtered-out')) {
        hasVisibleDescendant = true;
        break;
      }
    }
    if (hasVisibleDescendant) {
      row.classList.remove('filtered-out');
    }
  }
}

/* ── Ensure target row is visible (expand collapsed ancestors) ── */
function ensureRowVisible(targetRow) {
  if (!targetRow.classList.contains('hidden-row')) return;
  var targetDepth = parseInt(targetRow.dataset.depth, 10);
  var current = targetRow.previousElementSibling;
  var ancestorsToExpand = [];
  var d = targetDepth;
  while (current && d > 0) {
    var cd = parseInt(current.dataset.depth, 10);
    if (cd < d) {
      var arrow = current.querySelector('.arrow');
      if (arrow && !arrow.classList.contains('expanded') && !arrow.classList.contains('leaf')) {
        ancestorsToExpand.push(current);
      }
      d = cd;
    }
    current = current.previousElementSibling;
  }
  ancestorsToExpand.reverse();
  for (var i = 0; i < ancestorsToExpand.length; i++) {
    toggleNode(parseInt(ancestorsToExpand[i].dataset.id, 10));
  }
}

/* ── Handle messages from extension ───── */
window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.type === 'updateContent') {
    document.getElementById('contentRoot').innerHTML = msg.html;
    restoreState();

    setTimeout(() => {
      // Auto-scroll to selected enum value if present
      const selectedEnum = document.querySelector('.enum-value.selected');
      if (selectedEnum) {
        selectedEnum.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      const focused = document.querySelector('.schema-row.focused-child');
      if (focused) {
        ensureRowVisible(focused);
        focused.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      const firstPostCursor = document.querySelector('.schema-row:not(.before-cursor)[data-node-type="element"]');
      if (firstPostCursor) {
        ensureRowVisible(firstPostCursor);
        firstPostCursor.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
    if (!document.querySelector('.schema-row.focused-child')) {
      const firstRow = document.querySelector('.schema-row:not(.before-cursor)[data-node-type="element"][data-can-insert="true"]')
        || document.querySelector('.schema-row:not(.before-cursor)[data-node-type="element"]');
      if (firstRow) {
        ensureRowVisible(firstRow);
        firstRow.classList.add('focused-child');
      }
    }
  }
  if (msg.type === 'toggleFilter') {
    const bar = document.getElementById('filterBar');
    if (bar) {
      const isHidden = bar.style.display === 'none';
      bar.style.display = isHidden ? '' : 'none';
      document.body.classList.toggle('filter-visible', isHidden);
      var state = vscode.getState() || {};
      state.filterVisible = isHidden;
      if (!isHidden) { state.filterText = ''; }
      vscode.setState(state);
    }
  }
  if (msg.type === 'toggleDocColumn' && typeof toggleColumn === 'function') toggleColumn('doc');
  if (msg.type === 'toggleTypeColumn' && typeof toggleColumn === 'function') toggleColumn('type');
  if (msg.type === 'expandAll' && typeof expandAll === 'function') expandAll();
  if (msg.type === 'collapseAll' && typeof collapseAll === 'function') collapseAll();
  if (msg.type === 'updateColors') {
    document.documentElement.style.setProperty('--xve-tag-color', msg.tagColor);
    document.documentElement.style.setProperty('--xve-attr-color', msg.attrColor);
  }
});

/* ── Enum value click handler ─────────── */
document.addEventListener('click', function(e) {
  var target = e.target.closest('.enum-value');
  if (target && target.dataset.value !== undefined) {
    vscode.postMessage({ type: 'selectEnumValue', value: target.dataset.value });
  }
});`;
}
