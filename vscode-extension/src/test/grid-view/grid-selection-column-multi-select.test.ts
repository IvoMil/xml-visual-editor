import { strict as assert } from 'assert';
import {
  ControllerHost,
  GridMouseController,
  GridView,
} from '../../grid-view/scripts/mouse-bindings-controller';
import { GridSelectionSnapshot } from '../../grid-view/model/grid-selection';
import {
  attrColumnId,
  elemColumnId,
} from '../../grid-view/model/grid-selection-entry';

/**
 * Column multi-select (Shift+Click / Ctrl+Click) on the column axis,
 * mirroring the row-axis multi-select semantics. Drives the webview-
 * facing controller (`GridMouseController.onColumnClick`) directly so
 * the test is independent of any DOM twin.
 *
 * Refs: DESIGN_GRID_ALIGNMENT.md §9.7.
 */

const PARENT = '/root[1]/groupA[1]';
const COL_ID = attrColumnId(PARENT, 'id');
const COL_KIND = attrColumnId(PARENT, 'kind');
const COL_NAME = elemColumnId(PARENT, 'name');
const COL_VALUE = elemColumnId(PARENT, 'value');
const ORDERED_COLS = [COL_ID, COL_KIND, COL_NAME, COL_VALUE];

const ROW_1 = `${PARENT}/item[1]`;
const ROW_2 = `${PARENT}/item[2]`;

class FakeView implements GridView {
  rowIds: string[] = [];
  lastSnap: GridSelectionSnapshot | null = null;
  getRowIds(): string[] {
    return this.rowIds;
  }
  isComment(): boolean {
    return false;
  }
  getNodeType(): string {
    return 'element';
  }
  getVisibleDescendantIds(): string[] {
    return [];
  }
  applySelection(snap: GridSelectionSnapshot): void {
    this.lastSnap = snap;
  }
}

class FakeHost implements ControllerHost {
  messages: Array<Record<string, unknown>> = [];
  postMessage(msg: unknown): void {
    this.messages.push(msg as Record<string, unknown>);
  }
}

function makeController(): {
  view: FakeView;
  host: FakeHost;
  controller: GridMouseController;
} {
  const view = new FakeView();
  view.rowIds = [ROW_1, ROW_2];
  const host = new FakeHost();
  const controller = new GridMouseController(view, host);
  return { view, host, controller };
}

suite('GridSelectionModel — column multi-select', () => {
  test('plain click on a column-header selects only that column', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, [COL_ID]);
    assert.equal(snap.columnAnchor, COL_ID);
    assert.equal(snap.columnActiveCursor, COL_ID);
    assert.deepEqual(snap.nodeIds, []);
  });

  test('plain click on a column clears any previous row selection', () => {
    const { controller } = makeController();
    controller.onRowClick(ROW_1, { ctrl: false, shift: false });
    controller.onRowClick(ROW_2, { ctrl: true, shift: false });
    assert.equal(controller.getSelection().size, 2);
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.nodeIds, []);
    assert.deepEqual(snap.columnIds, [COL_ID]);
  });

  test('ctrl+click on a second column adds it and preserves the first', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_KIND, ORDERED_COLS, { ctrl: true, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(new Set(snap.columnIds), new Set([COL_ID, COL_KIND]));
    assert.equal(snap.columnAnchor, COL_ID, 'anchor remains at original click target');
    assert.equal(snap.columnActiveCursor, COL_KIND);
  });

  test('ctrl+click on an already-selected column removes it', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_KIND, ORDERED_COLS, { ctrl: true, shift: false });
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: true, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, [COL_KIND]);
  });

  test('shift+click extends from column anchor to clicked column inclusive', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: false, shift: true });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, [COL_ID, COL_KIND, COL_NAME]);
    assert.equal(snap.columnAnchor, COL_ID);
    assert.equal(snap.columnActiveCursor, COL_NAME);
  });

  test('shift+click without a prior column anchor behaves as plain select', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: false, shift: true });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, [COL_NAME]);
    assert.equal(snap.columnAnchor, COL_NAME);
  });

  test('plain click on a row after a column selection clears the columns', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_KIND, ORDERED_COLS, { ctrl: true, shift: false });
    controller.onRowClick(ROW_1, { ctrl: false, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, []);
    assert.equal(snap.columnAnchor, null);
    assert.equal(snap.columnActiveCursor, null);
    assert.deepEqual(snap.nodeIds, [ROW_1]);
  });

  test('ctrl+click on a row while columns are selected clears columns and starts a row set', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onRowClick(ROW_2, { ctrl: true, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, []);
    assert.deepEqual(snap.nodeIds, [ROW_2]);
  });

  test('clearSelection empties both row and column axes', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_KIND, ORDERED_COLS, { ctrl: true, shift: false });
    controller.clearSelection();
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, []);
    assert.deepEqual(snap.nodeIds, []);
    assert.equal(snap.columnAnchor, null);
    assert.equal(snap.columnActiveCursor, null);
    assert.equal(snap.anchor, null);
    assert.equal(snap.activeCursor, null);
  });

  test('column anchor remains fixed through subsequent ctrl+clicks', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_KIND, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: true, shift: false });
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: true, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.equal(snap.columnAnchor, COL_KIND, 'anchor stays at first click');
    assert.equal(snap.columnActiveCursor, COL_NAME);
  });

  test('snapshot exposes columnIds, columnAnchor, columnActiveCursor', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: false, shift: true });
    const snap = controller.getSelection().toJSON();
    assert.ok(Array.isArray(snap.columnIds));
    assert.ok(
      Object.prototype.hasOwnProperty.call(snap, 'columnAnchor'),
      'snapshot carries columnAnchor',
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(snap, 'columnActiveCursor'),
      'snapshot carries columnActiveCursor',
    );
    assert.equal(snap.columnAnchor, COL_ID);
    assert.equal(snap.columnActiveCursor, COL_NAME);
  });

  test('extendColumnCursor advances/retreats the focus by one step', () => {
    const { controller } = makeController();
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.extendColumnCursor(1, ORDERED_COLS);
    let snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, [COL_ID, COL_KIND]);
    assert.equal(snap.columnActiveCursor, COL_KIND);
    controller.extendColumnCursor(1, ORDERED_COLS);
    snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, [COL_ID, COL_KIND, COL_NAME]);
    assert.equal(snap.columnActiveCursor, COL_NAME);
  });
});
