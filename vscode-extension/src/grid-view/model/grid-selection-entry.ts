/**
 * B.1.e — Axis-aware selection entry types.
 *
 * A selection entry is either a ROW (an actual nodeId emitted by the
 * engine for an element/attribute/comment) or a COLUMN (a synthetic id
 * representing one attribute or scalar-element column of a hybrid/scalar
 * table region).
 *
 * Column-id synthesis (Q7 = A, DESIGN_GRID_ALIGNMENT.md §9.0):
 *
 *   ${parentNodeId}#col/@${attrName}   — attribute column
 *   ${parentNodeId}#col/${childName}   — element column (scalar or chevron)
 *
 * The literal `#col/` separator makes column ids NEVER collide with any
 * real engine-emitted node path (engine paths use `/` or `/@` but never
 * `#col/`). `parentNodeId` is the HYBRID RUN'S parent — e.g. for
 * groupA/item[*] the column id for the @id attribute is
 * `groupA#col/@id`, NOT `groupA/item[1]#col/@id`.
 */
export type SelectionKind = 'row' | 'column';

export interface SelectionEntry {
  readonly kind: SelectionKind;
  readonly nodeId: string;
}

/** Build a synthetic column id for an attribute column. */
export function attrColumnId(parentNodeId: string, attrName: string): string {
  return `${parentNodeId}#col/@${attrName}`;
}

/** Build a synthetic column id for a scalar / chevron element column. */
export function elemColumnId(parentNodeId: string, elemName: string): string {
  return `${parentNodeId}#col/${elemName}`;
}

/** Parse a synthetic column id back into its parent nodeId and column
 *  name. Returns null when `columnId` is not a well-formed column id
 *  (missing `#col/` marker). The column name for attribute columns
 *  INCLUDES the leading `@` (e.g. `@id`) so callers can round-trip. */
export function parseColumnId(
  columnId: string,
): { parentNodeId: string; columnName: string } | null {
  const marker = '#col/';
  const idx = columnId.indexOf(marker);
  if (idx === -1) return null;
  return {
    parentNodeId: columnId.substring(0, idx),
    columnName: columnId.substring(idx + marker.length),
  };
}

/** True iff `id` is a synthetic column id (contains `#col/`). */
export function isColumnId(id: string): boolean {
  return id.indexOf('#col/') !== -1;
}
