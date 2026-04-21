/**
 * Renderer-side bridge between a (row, column) cell and the axis-aware
 * selection class. Wraps `selectionAxisForCell` with the column-id
 * synthesis so the table-region emitters do not need to know how
 * column ids are shaped.
 *
 * Kept as a tiny helper module so the emitter files stay focussed on
 * HTML assembly and remain comfortably under the 500-line ceiling.
 */
import { GridSelectionModel } from '../model/grid-selection';
import {
  AxisClass,
  selectionAxisForCell,
} from '../model/grid-selection-axis';
import {
  attrColumnId,
  elemColumnId,
} from '../model/grid-selection-entry';

/** Column shape used by the hybrid/scalar emitters — matches their
 *  internal column descriptors (attr | elem). Scalar "(value)" columns
 *  synthesise via a sentinel column name (`(value)`) that will not
 *  collide with real element names (XML names cannot contain `(`). */
export type CellColKind = 'attr' | 'elem';

/**
 * Compute the axis-aware CSS class for one table-region cell.
 *
 * Returns `'none'` when the cell is not implicated by the current
 * selection, otherwise the class the cell should carry
 * (`'selected'` or `'column-selected'`).
 *
 * `selection` undefined ⇒ always `'none'` (no-op for render paths that
 * don't have a selection model, e.g. pure snapshot tests).
 */
export function resolveCellAxisClass(
  parentNodeId: string,
  rowNodeId: string,
  colKind: CellColKind,
  colName: string,
  flipped: boolean,
  selection: GridSelectionModel | undefined,
): AxisClass {
  if (!selection) return 'none';
  const columnId =
    colKind === 'attr'
      ? attrColumnId(parentNodeId, colName)
      : elemColumnId(parentNodeId, colName);
  return selectionAxisForCell({
    rowId: rowNodeId,
    columnId,
    flipped,
    rowSelected: selection.has(rowNodeId),
    columnSelected: selection.hasColumn(columnId),
  });
}

/** Space-prefixed class string for splicing into `<span class="t-cell...">`.
 *  Returns `''` when axis is `'none'` so callers can unconditionally
 *  interpolate the result. */
export function axisClassSuffix(axis: AxisClass): string {
  return axis === 'none' ? '' : ` ${axis}`;
}

/** Suffix the `column-selected` class onto a column-header cell when
 *  its synthetic `columnId` is in the model's column set. Always
 *  returns a space-prefixed suffix or ''. */
export function columnHeaderSelectedSuffix(
  columnId: string,
  selection: GridSelectionModel | undefined,
): string {
  if (!selection) return '';
  return selection.hasColumn(columnId) ? ' column-selected' : '';
}
