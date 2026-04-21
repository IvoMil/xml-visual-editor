import { strict as assert } from 'assert';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';
import {
  attrColumnId,
  elemColumnId,
} from '../../grid-view/model/grid-selection-entry';

/**
 * Invariant I3 (DESIGN_GRID_ALIGNMENT.md §9.7) — row-axis and
 * column-axis selections are MUTUALLY EXCLUSIVE. Every row-adding
 * mutator must clear column state first, every column-adding mutator
 * must clear row state first. These tests drive every public mutator
 * in a matrix and assert nodeIds.length and columnIds.length are never
 * both > 0 at any point.
 */

const PARENT = '/root[1]/groupA[1]';
const COL_A = attrColumnId(PARENT, 'id');
const COL_B = attrColumnId(PARENT, 'kind');
const COL_C = elemColumnId(PARENT, 'name');
const ROW_1 = `${PARENT}/item[1]`;
const ROW_2 = `${PARENT}/item[2]`;
const ROW_3 = `${PARENT}/item[3]`;

function assertExclusive(sel: GridSelectionModel, where: string): void {
  const snap = sel.toJSON();
  assert.ok(
    !(snap.nodeIds.length > 0 && snap.columnIds.length > 0),
    `I3 violated at ${where}: rows=[${snap.nodeIds.join(',')}] cols=[${snap.columnIds.join(
      ',',
    )}]`,
  );
}

suite('GridSelectionModel — mutual exclusion invariant (I3)', () => {
  test('addColumn clears row state before mutating', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith(ROW_1);
    sel.toggle(ROW_2);
    assert.equal(sel.size, 2);
    sel.addColumn(COL_A);
    assert.equal(sel.size, 0, 'row set emptied');
    assert.equal(sel.anchor, null);
    assert.equal(sel.activeCursor, null);
    assert.equal(sel.columnSize, 1);
    assertExclusive(sel, 'after addColumn');
  });

  test('selectId (replaceWith) clears column state before mutating', () => {
    const sel = new GridSelectionModel();
    sel.selectColumn(COL_A);
    sel.toggleColumn(COL_B);
    assert.equal(sel.columnSize, 2);
    sel.replaceWith(ROW_1);
    assert.equal(sel.columnSize, 0, 'columns emptied');
    assert.equal(sel.columnAnchor, null);
    assert.equal(sel.columnActiveCursor, null);
    assert.equal(sel.size, 1);
    assertExclusive(sel, 'after replaceWith');
  });

  test('toggleColumn clears row state before mutating', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith(ROW_1);
    sel.toggleColumn(COL_A);
    assert.equal(sel.size, 0);
    assert.equal(sel.columnSize, 1);
    assertExclusive(sel, 'after toggleColumn add');
  });

  test('toggleId (toggle) clears column state before mutating', () => {
    const sel = new GridSelectionModel();
    sel.selectColumn(COL_A);
    sel.toggle(ROW_1);
    assert.equal(sel.columnSize, 0);
    assert.equal(sel.size, 1);
    assertExclusive(sel, 'after toggle');
  });

  test('snapshot invariant holds after every public mutator in a matrix', () => {
    const sel = new GridSelectionModel();
    const orderedCols = [COL_A, COL_B, COL_C];
    const orderedRows = [ROW_1, ROW_2, ROW_3];
    const steps: Array<[string, () => void]> = [
      ['replaceWith R1', () => sel.replaceWith(ROW_1)],
      ['selectColumn COL_A', () => sel.selectColumn(COL_A)],
      ['toggle R1', () => sel.toggle(ROW_1)],
      ['toggleColumn COL_B', () => sel.toggleColumn(COL_B)],
      ['addIds [R2,R3]', () => sel.addIds([ROW_2, ROW_3])],
      ['selectColumn COL_C', () => sel.selectColumn(COL_C)],
      ['extendColumnRange COL_A', () => sel.extendColumnRange(COL_A, orderedCols)],
      ['extendRangeTo R3', () => sel.extendRangeTo(ROW_3, orderedRows)],
      ['addColumnRange A..C', () => sel.addColumnRange(COL_A, COL_C, orderedCols)],
      ['addColumn COL_B', () => sel.addColumn(COL_B)],
      ['selectAll', () => sel.selectAll(orderedRows)],
      ['addColumn COL_A', () => sel.addColumn(COL_A)],
      ['collapseToCursor', () => sel.collapseToCursor()],
    ];
    for (const [label, step] of steps) {
      step();
      assertExclusive(sel, label);
      sel.assertInvariants();
    }
  });

  test('clear() empties both axes', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith(ROW_1);
    sel.clear();
    assert.equal(sel.size, 0);
    assert.equal(sel.columnSize, 0);
    assert.equal(sel.anchor, null);
    assert.equal(sel.activeCursor, null);
    assert.equal(sel.columnAnchor, null);
    assert.equal(sel.columnActiveCursor, null);

    sel.selectColumn(COL_A);
    sel.toggleColumn(COL_B);
    sel.clear();
    assert.equal(sel.size, 0);
    assert.equal(sel.columnSize, 0);
    assert.equal(sel.columnAnchor, null);
    assert.equal(sel.columnActiveCursor, null);
    assertExclusive(sel, 'after clear');
  });
});
