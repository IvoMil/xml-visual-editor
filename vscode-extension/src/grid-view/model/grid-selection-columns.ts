/**
 * B.1.h — column-axis selection state (Shift/Ctrl multi-select).
 *
 * Mirrors the row-axis state owned by `GridSelectionModel` but for
 * synthetic column ids (`${parent}#col/...`). Kept in its own module so
 * the main selection file stays comfortably under the 500-line ceiling.
 *
 * Invariants (asserted by the owning model):
 *   C1. `size === 0` iff `anchor === null` iff `activeCursor === null`.
 *   C2. When non-empty: `anchor ∈ columns` and `activeCursor ∈ columns`.
 *
 * The model enforces mutual exclusion with the row axis (Invariant I3 in
 * the parent file): no public mutator here touches row state — the model
 * clears the opposite axis before dispatching into these methods.
 *
 * Refs: docs/designs/DESIGN_GRID_ALIGNMENT.md §9.7.
 */

export class ColumnSelection {
  private _columns: Set<string> = new Set();
  private _anchor: string | null = null;
  private _cursor: string | null = null;

  get columns(): ReadonlySet<string> {
    return this._columns;
  }

  get size(): number {
    return this._columns.size;
  }

  get anchor(): string | null {
    return this._anchor;
  }

  get activeCursor(): string | null {
    return this._cursor;
  }

  has(columnId: string): boolean {
    return this._columns.has(columnId);
  }

  /** Plain click: replace the set with a single column id. */
  replaceWith(columnId: string): void {
    this._columns = new Set([columnId]);
    this._anchor = columnId;
    this._cursor = columnId;
  }

  /** Idempotent add; preserves existing anchor, advances cursor. */
  add(columnId: string): void {
    this._columns.add(columnId);
    if (this._anchor === null) this._anchor = columnId;
    this._cursor = columnId;
  }

  /** Idempotent remove. Falls the cursor/anchor back per C1/C2. */
  remove(columnId: string): void {
    if (!this._columns.delete(columnId)) return;
    if (this._columns.size === 0) {
      this._anchor = null;
      this._cursor = null;
      return;
    }
    if (this._cursor === columnId) {
      this._cursor =
        this._anchor !== null && this._anchor !== columnId && this._columns.has(this._anchor)
          ? this._anchor
          : (this._columns.values().next().value as string);
    }
    if (this._anchor === columnId) {
      this._anchor = this._cursor;
    }
  }

  /** Ctrl+Click: toggle membership. */
  toggle(columnId: string): void {
    if (this._columns.has(columnId)) this.remove(columnId);
    else this.add(columnId);
  }

  /**
   * Shift+Click: replace with the inclusive slice of `orderedColumnIds`
   * between the current anchor (or `columnId` if none) and `columnId`.
   * Falls back to a plain select when `columnId` is not in the ordered
   * list (the caller's column layout must be stale — just pick).
   */
  extendRangeTo(columnId: string, orderedColumnIds: readonly string[]): void {
    const targetIdx = orderedColumnIds.indexOf(columnId);
    if (targetIdx === -1) {
      this.replaceWith(columnId);
      return;
    }
    let anchorIdx = this._anchor === null ? -1 : orderedColumnIds.indexOf(this._anchor);
    if (anchorIdx === -1) {
      this._anchor = columnId;
      anchorIdx = targetIdx;
    }
    const [lo, hi] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    this._columns = new Set(orderedColumnIds.slice(lo, hi + 1));
    this._cursor = columnId;
  }

  /** Programmatic range add keyed explicitly on two endpoint ids. */
  addRange(anchorId: string, focusId: string, orderedColumnIds: readonly string[]): void {
    const a = orderedColumnIds.indexOf(anchorId);
    const b = orderedColumnIds.indexOf(focusId);
    if (a === -1 || b === -1) return;
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    for (let i = lo; i <= hi; i++) this._columns.add(orderedColumnIds[i]);
    if (this._anchor === null) this._anchor = anchorId;
    this._cursor = focusId;
  }

  setAnchor(columnId: string | null): void {
    if (columnId === null) {
      this._anchor = null;
      return;
    }
    this._anchor = columnId;
    if (this._cursor === null) this._cursor = columnId;
  }

  setActiveCursor(columnId: string | null): void {
    this._cursor = columnId;
  }

  clear(): void {
    this._columns = new Set();
    this._anchor = null;
    this._cursor = null;
  }

  /** Drop column entries whose parent nodeId is no longer rendered. */
  reconcile(existingParentIds: ReadonlySet<string>): void {
    if (this._columns.size === 0) return;
    const next = new Set<string>();
    for (const col of this._columns) {
      const marker = col.indexOf('#col/');
      if (marker === -1) continue;
      const parentId = col.substring(0, marker);
      if (existingParentIds.has(parentId)) next.add(col);
    }
    this._columns = next;
    if (this._anchor !== null && !this._columns.has(this._anchor)) {
      this._anchor =
        this._columns.size > 0 ? (this._columns.values().next().value as string) : null;
    }
    if (this._cursor !== null && !this._columns.has(this._cursor)) {
      this._cursor = this._anchor;
    }
  }

  /** Debug / assertion helper — verifies C1/C2 hold. Throws on violation. */
  assertInvariants(): void {
    const empty = this._columns.size === 0;
    if (empty) {
      if (this._anchor !== null || this._cursor !== null) {
        throw new Error('ColumnSelection C1: empty but anchor/cursor non-null');
      }
      return;
    }
    if (this._anchor === null || !this._columns.has(this._anchor)) {
      throw new Error('ColumnSelection C2: anchor not in columns');
    }
    if (this._cursor === null || !this._columns.has(this._cursor)) {
      throw new Error('ColumnSelection C2: cursor not in columns');
    }
  }
}
