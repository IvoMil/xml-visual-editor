import { strict as assert } from 'assert';
import {
  GridMouseController,
  GridView,
  ControllerHost,
  isInEditableContext,
} from '../../grid-view/scripts/mouse-bindings-controller';
import { GridSelectionSnapshot } from '../../grid-view/model/grid-selection';

/**
 * Keyboard multi-select bindings.
 *
 * The webview script wires Shift+Arrow / Shift+Home / Shift+End / Escape /
 * Ctrl+A onto the same GridMouseController instance that owns the
 * selection model. These tests cover the canonical controller methods
 * (extendRangeTo / collapseToCursor / selectAllVisible) plus the focus
 * bailout helper used by the Ctrl+A glue.
 *
 * Comment rows are INCLUDED in the ordered list passed to extendRangeTo
 * per DESIGN_GRID_MULTI_SELECT.
 */

interface FakeRow {
  id: string;
  isComment: boolean;
  nodeType: string;
  selected: boolean;
  cursor: boolean;
}

class FakeView implements GridView {
  rows: FakeRow[] = [];

  setRows(rows: Array<{ id: string; isComment?: boolean; nodeType?: string }>): void {
    this.rows = rows.map((r) => ({
      id: r.id,
      isComment: r.isComment ?? false,
      nodeType: r.nodeType ?? 'element',
      selected: false,
      cursor: false,
    }));
  }

  selectedIds(): string[] {
    return this.rows.filter((r) => r.selected).map((r) => r.id);
  }

  cursorId(): string | null {
    const r = this.rows.find((row) => row.cursor);
    return r ? r.id : null;
  }

  getRowIds(): string[] {
    return this.rows.map((r) => r.id);
  }

  isComment(nodeId: string): boolean {
    return this.rows.find((r) => r.id === nodeId)?.isComment ?? false;
  }

  getNodeType(nodeId: string): string {
    return this.rows.find((r) => r.id === nodeId)?.nodeType ?? 'element';
  }

  applySelection(snap: GridSelectionSnapshot): void {
    const selSet = new Set(snap.nodeIds);
    for (const r of this.rows) {
      r.selected = selSet.has(r.id);
      r.cursor = r.id === snap.activeCursor;
    }
  }
}

class FakeHost implements ControllerHost {
  messages: Array<Record<string, unknown>> = [];
  postMessage(msg: unknown): void {
    this.messages.push(msg as Record<string, unknown>);
  }
}

/** Mirror the webview glue: plain Arrow moves the single cursor, Shift
 *  +Arrow calls extendRangeTo using an ordered list of row ids. */
function plainArrowDown(
  ctrl: GridMouseController,
  visibleSelectable: string[],
): void {
  const cursor = ctrl.getSelection().activeCursor;
  const idx = cursor === null ? -1 : visibleSelectable.indexOf(cursor);
  const next = idx < 0
    ? visibleSelectable[0]
    : visibleSelectable[Math.min(idx + 1, visibleSelectable.length - 1)];
  ctrl.setSingle(next);
}

function shiftArrowDown(ctrl: GridMouseController, allOrdered: string[]): void {
  const cursor = ctrl.getSelection().activeCursor;
  const idx = cursor === null ? -1 : allOrdered.indexOf(cursor);
  const target = idx < 0
    ? allOrdered[0]
    : allOrdered[Math.min(idx + 1, allOrdered.length - 1)];
  ctrl.extendRangeTo(target, allOrdered);
}

function shiftArrowUp(ctrl: GridMouseController, allOrdered: string[]): void {
  const cursor = ctrl.getSelection().activeCursor;
  const idx = cursor === null ? -1 : allOrdered.indexOf(cursor);
  const target = idx < 0 ? allOrdered[0] : allOrdered[Math.max(0, idx - 1)];
  ctrl.extendRangeTo(target, allOrdered);
}

suite('GridMouseController — keyboard multi-select bindings', () => {
  let view: FakeView;
  let host: FakeHost;
  let ctrl: GridMouseController;

  setup(() => {
    view = new FakeView();
    host = new FakeHost();
    ctrl = new GridMouseController(view, host);
    view.setRows([{ id: 'R1' }, { id: 'R2' }, { id: 'R3' }, { id: 'R4' }]);
    ctrl.onRowClick('R1', { ctrl: false, shift: false });
  });

  test('plain ArrowDown keeps selection size at 1 and moves cursor', () => {
    plainArrowDown(ctrl, ['R1', 'R2', 'R3', 'R4']);
    assert.deepEqual(view.selectedIds(), ['R2']);
    assert.equal(view.cursorId(), 'R2');
    assert.equal(ctrl.getSelection().size, 1);
  });

  test('Shift+ArrowDown extends range by one row; anchor preserved', () => {
    shiftArrowDown(ctrl, ['R1', 'R2', 'R3', 'R4']);
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2']);
    assert.equal(view.cursorId(), 'R2');
    assert.equal(ctrl.getSelection().anchor, 'R1');
  });

  test('Shift+ArrowDown twice extends to three rows', () => {
    shiftArrowDown(ctrl, ['R1', 'R2', 'R3', 'R4']);
    shiftArrowDown(ctrl, ['R1', 'R2', 'R3', 'R4']);
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3']);
    assert.equal(view.cursorId(), 'R3');
    assert.equal(ctrl.getSelection().anchor, 'R1');
  });

  test('Shift+ArrowDown then Shift+ArrowUp shrinks range by one (cursor moves back)', () => {
    const order = ['R1', 'R2', 'R3', 'R4'];
    shiftArrowDown(ctrl, order); // → R1..R2
    shiftArrowDown(ctrl, order); // → R1..R3
    shiftArrowUp(ctrl, order); // → R1..R2
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2']);
    assert.equal(view.cursorId(), 'R2');
    assert.equal(ctrl.getSelection().anchor, 'R1');
  });

  test('Shift+ArrowDown crossing a comment row INCLUDES the comment in the range', () => {
    view.setRows([
      { id: 'R1' },
      { id: 'R2', isComment: true, nodeType: 'comment' },
      { id: 'R3' },
      { id: 'R4' },
    ]);
    ctrl.onRowClick('R1', { ctrl: false, shift: false });
    const allOrdered = ['R1', 'R2', 'R3', 'R4'];
    shiftArrowDown(ctrl, allOrdered); // R1..R2 (comment)
    shiftArrowDown(ctrl, allOrdered); // R1..R3
    assert.ok(view.selectedIds().includes('R2'), 'comment row must be in range');
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3']);
  });

  test('Shift+End extends to the last visible row', () => {
    const order = ['R1', 'R2', 'R3', 'R4'];
    ctrl.extendRangeTo('R4', order);
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3', 'R4']);
    assert.equal(view.cursorId(), 'R4');
    assert.equal(ctrl.getSelection().anchor, 'R1');
  });

  test('Shift+Home extends to the first visible row (backward)', () => {
    const order = ['R1', 'R2', 'R3', 'R4'];
    ctrl.onRowClick('R3', { ctrl: false, shift: false }); // anchor=R3
    ctrl.extendRangeTo('R1', order);
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3']);
    assert.equal(view.cursorId(), 'R1');
    assert.equal(ctrl.getSelection().anchor, 'R3');
  });

  test('Escape collapses a 4-row selection to {cursor}', () => {
    const order = ['R1', 'R2', 'R3', 'R4'];
    ctrl.extendRangeTo('R4', order); // R1..R4 cursor=R4
    ctrl.collapseToCursor();
    assert.deepEqual(view.selectedIds(), ['R4']);
    assert.equal(view.cursorId(), 'R4');
    assert.equal(ctrl.getSelection().anchor, 'R4');
  });

  test('Ctrl+A selects every visible row', () => {
    const all = ['R1', 'R2', 'R3', 'R4'];
    ctrl.selectAllVisible(all);
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3', 'R4']);
    assert.equal(ctrl.getSelection().size, 4);
  });

  test('Ctrl+A focus-bailout: editable target short-circuits before controller call', () => {
    const fakeInputTarget = {
      closest(sel: string): unknown {
        return sel.includes('input') ? { tagName: 'INPUT' } : null;
      },
    };
    assert.equal(isInEditableContext(fakeInputTarget), true);

    // Webview glue bails out → selectAllVisible is NEVER called. Confirm
    // the model stays at the pre-existing single-row selection.
    assert.deepEqual(view.selectedIds(), ['R1']);
    assert.equal(ctrl.getSelection().size, 1);
  });

  test('isInEditableContext returns false outside an editable host', () => {
    const fakeRow = { closest(_: string): unknown { return null; } };
    assert.equal(isInEditableContext(fakeRow), false);
    assert.equal(isInEditableContext(null), false);
    assert.equal(isInEditableContext(undefined), false);
  });

  test('plain ArrowDown after Escape keeps size=1 and moves cursor', () => {
    const order = ['R1', 'R2', 'R3', 'R4'];
    ctrl.extendRangeTo('R3', order); // R1..R3
    ctrl.collapseToCursor(); // {R3}
    plainArrowDown(ctrl, order);
    assert.deepEqual(view.selectedIds(), ['R4']);
    assert.equal(view.cursorId(), 'R4');
    assert.equal(ctrl.getSelection().size, 1);
  });

  test('reconcile after document.update preserves anchor + cursor across keyboard ops', () => {
    const order = ['R1', 'R2', 'R3', 'R4'];
    ctrl.extendRangeTo('R3', order); // anchor=R1 cursor=R3 → {R1,R2,R3}
    // Simulate a re-render that drops R2 but keeps R1/R3/R4.
    view.setRows([{ id: 'R1' }, { id: 'R3' }, { id: 'R4' }]);
    ctrl.reconcile(['R1', 'R3', 'R4'], 'R1');
    assert.equal(ctrl.getSelection().anchor, 'R1');
    assert.equal(ctrl.getSelection().activeCursor, 'R3');
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R3']);
  });

  test('selectAllVisible broadcasts selectionChanged on the active cursor', () => {
    host.messages.length = 0;
    ctrl.selectAllVisible(['R1', 'R2', 'R3', 'R4']);
    const changed = host.messages.find((m) => m.type === 'selectionChanged');
    assert.ok(changed, 'expected selectionChanged broadcast');
    const snap = changed!.selection as GridSelectionSnapshot;
    assert.equal(snap.nodeIds.length, 4);
    assert.ok(snap.activeCursor !== null);
  });

  test('collapseToCursor is a no-op on an empty selection (nothing broadcast)', () => {
    const freshView = new FakeView();
    const freshHost = new FakeHost();
    const freshCtrl = new GridMouseController(freshView, freshHost);
    freshView.setRows([{ id: 'R1' }, { id: 'R2' }]);
    freshCtrl.collapseToCursor();
    assert.equal(freshHost.messages.length, 0);
    assert.equal(freshCtrl.getSelection().size, 0);
  });
});
