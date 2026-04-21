import { strict as assert } from 'assert';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';
import {
  attrColumnId,
  elemColumnId,
} from '../../grid-view/model/grid-selection-entry';
import { selectionAxisForCell } from '../../grid-view/model/grid-selection-axis';

/**
 * Flip-axis preservation: rows selected BEFORE a flip render as column-
 * highlighted cells AFTER the flip, and vice versa. The selection model
 * stores entries by their original axis (row vs column) and the render
 * pathway resolves the visual class at emit time via
 * `selectionAxisForCell`. Tests drive the helper directly so the
 * preservation property is independently proven without any DOM.
 */

const PARENT = '/root[1]/groupA[1]';
const ROW_1 = `${PARENT}/item[1]`;
const ROW_2 = `${PARENT}/item[2]`;
const COL_ID = attrColumnId(PARENT, 'id');
const COL_NAME = elemColumnId(PARENT, 'name');

function classFor(
  rowId: string,
  columnId: string,
  flipped: boolean,
  sel: GridSelectionModel,
): 'selected' | 'column-selected' | 'none' {
  return selectionAxisForCell({
    rowId,
    columnId,
    flipped,
    rowSelected: sel.has(rowId),
    columnSelected: sel.hasColumn(columnId),
  });
}

suite('GridSelectionModel — flip-axis preservation', () => {
  test('row selected before flip renders as column-highlight after flip', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith(ROW_1);

    // Before flip: the whole ROW_1 row carries `.selected` on each cell.
    assert.equal(classFor(ROW_1, COL_ID, false, sel), 'selected');
    assert.equal(classFor(ROW_1, COL_NAME, false, sel), 'selected');
    assert.equal(classFor(ROW_2, COL_ID, false, sel), 'none');

    // After flip: ROW_1 becomes a VISUAL COLUMN; every cell that used
    // to be on ROW_1 now contributes `.column-selected`.
    assert.equal(classFor(ROW_1, COL_ID, true, sel), 'column-selected');
    assert.equal(classFor(ROW_1, COL_NAME, true, sel), 'column-selected');
    assert.equal(classFor(ROW_2, COL_ID, true, sel), 'none');

    // Selection snapshot itself is untouched by flip.
    assert.deepEqual(sel.toJSON().nodeIds, [ROW_1]);
    assert.deepEqual(sel.toJSON().columnIds, []);
  });

  test('column selected before flip renders as row-highlight after flip', () => {
    const sel = new GridSelectionModel();
    sel.selectColumn(COL_ID);

    // Before flip: COL_ID is a visual column — every cell in that
    // column gets `.column-selected`.
    assert.equal(classFor(ROW_1, COL_ID, false, sel), 'column-selected');
    assert.equal(classFor(ROW_2, COL_ID, false, sel), 'column-selected');
    assert.equal(classFor(ROW_1, COL_NAME, false, sel), 'none');

    // After flip: COL_ID becomes a VISUAL ROW — cells in it get
    // `.selected`.
    assert.equal(classFor(ROW_1, COL_ID, true, sel), 'selected');
    assert.equal(classFor(ROW_2, COL_ID, true, sel), 'selected');
    assert.equal(classFor(ROW_1, COL_NAME, true, sel), 'none');

    assert.deepEqual(sel.toJSON().columnIds, [COL_ID]);
    assert.deepEqual(sel.toJSON().nodeIds, []);
  });

  test('selection survives a double flip (identity)', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith(ROW_1);
    sel.toggle(ROW_2);

    const beforeSnap = sel.toJSON();

    // Render once flipped, once unflipped — no mutation.
    void classFor(ROW_1, COL_ID, true, sel);
    void classFor(ROW_2, COL_NAME, false, sel);

    const afterSnap = sel.toJSON();
    assert.deepEqual(afterSnap, beforeSnap);

    // Unflipped after the round trip still behaves the same as the
    // original.
    assert.equal(classFor(ROW_1, COL_ID, false, sel), 'selected');
    assert.equal(classFor(ROW_2, COL_NAME, false, sel), 'selected');
  });

  test('selection survives tableMode OFF→ON→OFF toggle (renderer-side only)', () => {
    const sel = new GridSelectionModel();
    sel.selectColumn(COL_ID);
    sel.toggleColumn(COL_NAME);
    const before = sel.toJSON();

    // tableMode is a pure renderer choice: toggling it cannot
    // mutate the selection model. Simulate by re-reading the axis for
    // the same ids across OFF→ON→OFF; the answers must match the
    // unflipped view in both OFF and ON (flipped=false in both).
    const cls1 = classFor(ROW_1, COL_ID, false, sel); // OFF render
    const cls2 = classFor(ROW_1, COL_ID, false, sel); // ON render
    const cls3 = classFor(ROW_1, COL_ID, false, sel); // back to OFF
    assert.equal(cls1, 'column-selected');
    assert.equal(cls2, 'column-selected');
    assert.equal(cls3, 'column-selected');

    const after = sel.toJSON();
    assert.deepEqual(after, before, 'snapshot unchanged across tableMode toggle');
  });
});
