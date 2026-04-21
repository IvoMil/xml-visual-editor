/**
 * Axis-aware selection class resolution for a single table-region cell.
 *
 * The selection model keeps entries with their original `kind` (`row` or
 * `column`) across a flip toggle — only the RENDERER's choice of visual
 * axis swaps. This helper encapsulates the mapping:
 *
 *   unflipped view:
 *     row-selection   → the original row is a visual row → `.selected`
 *     col-selection   → the original column is a visual column → cells
 *                       in that column get `.column-selected`
 *
 *   flipped view:
 *     row-selection   → the original row is now a visual COLUMN → cells
 *                       that correspond to the selected rowId get
 *                       `.column-selected`
 *     col-selection   → the original column is now a visual ROW →
 *                       that visual row gets `.selected`
 *
 * The helper is pure: callers pass row/col ids and the current flip
 * state, plus membership predicates. Returns the CSS class the cell
 * should carry (or `'none'`).
 */
export type AxisClass = 'selected' | 'column-selected' | 'none';

export interface CellAxisInput {
  /** Original-axis row id of the cell (engine nodeId). */
  readonly rowId: string;
  /** Original-axis column id of the cell (synthetic `${parent}#col/...`). */
  readonly columnId: string;
  /** True when the owning table region is currently flipped. */
  readonly flipped: boolean;
  /** True when the selection holds a row-kind entry for `rowId`. */
  readonly rowSelected: boolean;
  /** True when the selection holds a column-kind entry for `columnId`. */
  readonly columnSelected: boolean;
}

/** Resolve the axis-aware CSS class for a single table-region cell. */
export function selectionAxisForCell(input: CellAxisInput): AxisClass {
  const { flipped, rowSelected, columnSelected } = input;
  if (!flipped) {
    if (rowSelected) return 'selected';
    if (columnSelected) return 'column-selected';
    return 'none';
  }
  // Flipped: axes swap literally.
  if (columnSelected) return 'selected';
  if (rowSelected) return 'column-selected';
  return 'none';
}
