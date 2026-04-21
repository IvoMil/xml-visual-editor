/**
 * GridSelectionModel — pure selection state for the Grid View webview.
 *
 * Owns row-axis fields (`nodeIds`, `anchor`, `activeCursor`) directly,
 * delegates column-axis state to `ColumnSelection` (see
 * `grid-selection-columns.ts`). Zero DOM / VS Code dependencies.
 *
 * Invariants (asserted by `assertInvariants()` + every mutator guards):
 *   - Row: `size === 0` iff `anchor === null` iff `activeCursor === null`.
 *   - Row: when non-empty, `anchor ∈ nodeIds` and `activeCursor ∈ nodeIds`.
 *   - Mutual exclusion: `nodeIds.size > 0 && columnSize > 0` is impossible.
 *   - Column: `columnSize > 0` implies column anchor + cursor are both
 *     members of `columnIds`. Row invariants mirror in `ColumnSelection`.
 *
 * First reconcile after construction / `clear()` leaves an empty
 * selection EMPTY (fallback only applies on SUBSEQUENT reconciles —
 * recovery mechanism, not initialiser). Tracked via
 * `_initialReconcileDone`.
 *
 * Axis-aware entries; selection survives tableMode toggle; axis swap on
 * flip is renderer-side only. selectAll / collapseToCursor / reconcile.
 * Column Shift/Ctrl multi-select with row/column mutual exclusion.
 */
import {
  FingerprintReconcileState,
  reconcileWithFingerprintsInPlace,
} from './grid-selection-reconcile';
import { ColumnSelection } from './grid-selection-columns';

export interface GridSelectionSnapshot {
  nodeIds: string[];
  anchor: string | null;
  activeCursor: string | null;
  /** Synthetic column ids currently selected. */
  columnIds: string[];
  /** Origin of column-axis range extensions (Shift+Click). */
  columnAnchor: string | null;
  /** Column-axis focus ring target. */
  columnActiveCursor: string | null;
}

export class GridSelectionModel {
  private _nodeIds: Set<string> = new Set();
  private _anchor: string | null = null;
  private _activeCursor: string | null = null;
  /** Per-id content fingerprints captured at selection-mutation time.
   *  `captureFingerprints` preserves existing values so the
   *  "captured at add time" semantic survives later fresh maps. */
  private _fingerprints: Map<string, string> = new Map();
  /** Axis-aware column selection state. Row and column axes are
   *  MUTUALLY EXCLUSIVE: any mutator that would add to one axis first
   *  clears the other. */
  private _columnSel: ColumnSelection = new ColumnSelection();
  /** True once the model has observed its first reconcile OR any
   *  mutator call. While false, a reconcile that would leave the
   *  selection empty does NOT fall back to the caller's
   *  `fallbackFirstVisibleId` (freshly-opened document has no highlight
   *  until the user clicks). `clear()` resets this to false so a later
   *  re-open behaves like a fresh session. */
  private _initialReconcileDone: boolean = false;

  constructor(initialNodeId?: string) {
    if (initialNodeId !== undefined) {
      this.replaceWith(initialNodeId);
    }
  }

  get size(): number {
    return this._nodeIds.size;
  }

  get anchor(): string | null {
    return this._anchor;
  }

  get activeCursor(): string | null {
    return this._activeCursor;
  }

  get nodeIds(): ReadonlySet<string> {
    return this._nodeIds;
  }

  has(nodeId: string): boolean {
    return this._nodeIds.has(nodeId);
  }

  /** Click / plain-arrow: replace the selection with a single id. */
  replaceWith(nodeId: string): void {
    this._columnSel.clear();
    this._nodeIds = new Set([nodeId]);
    this._anchor = nodeId;
    this._activeCursor = nodeId;
    this._initialReconcileDone = true;
  }

  /** Ctrl+Click: toggle membership of `nodeId`. Empty-set add sets
   *  anchor+cursor; non-empty add advances cursor. Remove-last clears
   *  to empty; remove-of-cursor/anchor falls back to any surviving id. */
  toggle(nodeId: string): void {
    if (this._nodeIds.has(nodeId)) {
      this._nodeIds.delete(nodeId);
      if (this._nodeIds.size === 0) {
        this.clearInternal();
        this._initialReconcileDone = true;
        return;
      }
      if (this._activeCursor === nodeId) {
        this._activeCursor = this.pickFallbackCursor(nodeId);
      }
      if (this._anchor === nodeId) {
        this._anchor = this._activeCursor;
      }
      this._initialReconcileDone = true;
      return;
    }
    // Mutual exclusion: adding a row while columns are present must
    // first clear the column axis.
    this._columnSel.clear();
    this._nodeIds.add(nodeId);
    if (this._anchor === null) {
      this._anchor = nodeId;
    }
    this._activeCursor = nodeId;
    this._initialReconcileDone = true;
  }

  /** Shift+Click/Shift+Arrow: replace set with inclusive slice of
   *  `orderedVisibleIds` between anchor (or `nodeId` if anchor absent)
   *  and `nodeId`. Comments participate when caller includes them. */
  extendRangeTo(nodeId: string, orderedVisibleIds: readonly string[]): void {
    this._columnSel.clear();
    const targetIdx = orderedVisibleIds.indexOf(nodeId);
    if (targetIdx === -1) {
      // Target isn't visible — fall back to single-row replacement.
      this.replaceWith(nodeId);
      return;
    }
    let anchorIdx = this._anchor === null ? -1 : orderedVisibleIds.indexOf(this._anchor);
    if (anchorIdx === -1) {
      this._anchor = nodeId;
      anchorIdx = targetIdx;
    }
    const [lo, hi] = anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];
    this._nodeIds = new Set(orderedVisibleIds.slice(lo, hi + 1));
    this._activeCursor = nodeId;
    this._initialReconcileDone = true;
  }

  /** Merge ids without touching anchor/cursor (batch expand growth).
   *  Establishes anchor+cursor only when previously empty. */
  addIds(ids: readonly string[]): void {
    if (ids.length === 0) {
      return;
    }
    this._columnSel.clear();
    const wasEmpty = this._nodeIds.size === 0;
    for (const id of ids) {
      this._nodeIds.add(id);
    }
    if (wasEmpty) {
      this._anchor = ids[0];
      this._activeCursor = ids[0];
    }
    this._initialReconcileDone = true;
  }

  /** Bulk remove; falls cursor/anchor back to surviving anchor or
   *  first remaining id. No-op on empty `ids`.
   */
  removeIds(ids: readonly string[]): void {
    if (ids.length === 0) {
      return;
    }
    let changed = false;
    for (const id of ids) {
      if (this._nodeIds.delete(id)) changed = true;
    }
    if (!changed) return;
    this._initialReconcileDone = true;
    if (this._nodeIds.size === 0) {
      this.clearInternal();
      return;
    }
    const cursorSurvived = this._activeCursor !== null && this._nodeIds.has(this._activeCursor);
    const anchorSurvived = this._anchor !== null && this._nodeIds.has(this._anchor);
    if (!cursorSurvived) {
      this._activeCursor = anchorSurvived
        ? this._anchor
        : (this._nodeIds.values().next().value as string);
    }
    if (!anchorSurvived) {
      this._anchor = this._activeCursor;
    }
  }

  /** Escape: collapse back to `{activeCursor}`. No-op on empty selection. */
  collapseToCursor(): void {
    if (this._activeCursor === null) {
      return;
    }
    const cursor = this._activeCursor;
    this._nodeIds = new Set([cursor]);
    this._anchor = cursor;
    this._initialReconcileDone = true;
  }

  /** Ctrl+A: select every visible id. Preserves anchor+cursor
   *  when still present; otherwise falls back to `anchorHint` (when
   *  present in the new set) or the first visible id. No-op on empty. */
  selectAll(visibleIds: readonly string[], anchorHint?: string | null): void {
    if (visibleIds.length === 0) {
      return;
    }
    this._columnSel.clear();
    this._nodeIds = new Set(visibleIds);
    const first = visibleIds[0];
    const hint =
      anchorHint !== undefined && anchorHint !== null && this._nodeIds.has(anchorHint)
        ? anchorHint
        : first;
    if (this._anchor === null || !this._nodeIds.has(this._anchor)) {
      this._anchor = hint;
    }
    if (this._activeCursor === null || !this._nodeIds.has(this._activeCursor)) {
      this._activeCursor = hint;
    }
    this._initialReconcileDone = true;
  }

  /** Reconcile against a doc-ordered set of valid ids after a
   *  re-render. Drops missing ids; cursor falls back to anchor (when
   *  survived) or first-surviving-in-doc-order; anchor inherits cursor
   *  when dropped; empty selection falls back to `fallbackFirstVisibleId`
   *  EXCEPT on the first reconcile where it stays empty. Accepts
   *  array (preferred) or Set (order degrades to iteration order). */
  reconcile(
    existingIds: readonly string[] | ReadonlySet<string>,
    fallbackFirstVisibleId: string | null,
  ): void {
    const existingSet: ReadonlySet<string> =
      existingIds instanceof Set ? existingIds : new Set(existingIds as readonly string[]);
    const orderedExisting: readonly string[] | null = Array.isArray(existingIds)
      ? (existingIds as readonly string[])
      : null;
    // Drop any synthetic column id whose parent nodeId is no longer
    // rendered. `existingSet` IS the fresh nodeId tree, so it doubles
    // as the parent-existence check (column ids are
    // `${parentId}#col/...` — see grid-selection-entry.ts).
    this._columnSel.reconcile(existingSet);

    // Preserve DOCUMENT ORDER for the survivors — required for the
    // "first-surviving-in-doc-order" cursor fallback.
    const survivingOrdered: string[] = [];
    if (orderedExisting !== null) {
      for (const id of orderedExisting) {
        if (this._nodeIds.has(id)) {
          survivingOrdered.push(id);
        }
      }
    } else {
      for (const id of this._nodeIds) {
        if (existingSet.has(id)) {
          survivingOrdered.push(id);
        }
      }
    }

    if (survivingOrdered.length === 0) {
      // On the FIRST reconcile (freshly-opened document), skip the
      // fallback and end up fully empty. The fallback is a RECOVERY
      // mechanism for later live-edit reconciles (user already
      // interacted), not an INITIALISER.
      if (!this._initialReconcileDone) {
        this.clearInternal();
        this._initialReconcileDone = true;
        return;
      }
      if (fallbackFirstVisibleId !== null) {
        this.replaceWith(fallbackFirstVisibleId);
      } else {
        this.clearInternal();
      }
      this._initialReconcileDone = true;
      return;
    }

    this._nodeIds = new Set(survivingOrdered);

    const cursorSurvived = this._activeCursor !== null && existingSet.has(this._activeCursor);
    const anchorSurvived = this._anchor !== null && existingSet.has(this._anchor);

    if (!cursorSurvived) {
      this._activeCursor = anchorSurvived ? this._anchor : survivingOrdered[0];
    }
    if (!anchorSurvived) {
      this._anchor = this._activeCursor;
    }
    this._initialReconcileDone = true;
  }

  toJSON(): GridSelectionSnapshot {
    return {
      nodeIds: Array.from(this._nodeIds),
      anchor: this._anchor,
      activeCursor: this._activeCursor,
      columnIds: Array.from(this._columnSel.columns),
      columnAnchor: this._columnSel.anchor,
      columnActiveCursor: this._columnSel.activeCursor,
    };
  }

  /** Capture fingerprints for current selection; preserves
   *  already-captured values (selection-time semantics) and fills in
   *  fresh entries for newly-added ids. */
  captureFingerprints(freshFingerprints: ReadonlyMap<string, string>): void {
    const next = new Map<string, string>();
    for (const id of this._nodeIds) {
      const existing = this._fingerprints.get(id);
      if (existing !== undefined) {
        next.set(id, existing);
        continue;
      }
      const fresh = freshFingerprints.get(id);
      if (fresh !== undefined) {
        next.set(id, fresh);
      }
    }
    this._fingerprints = next;
  }

  /** Test / debug accessor: returns a copy of the captured fingerprint map. */
  getFingerprints(): Map<string, string> {
    return new Map(this._fingerprints);
  }

  /** REMAP-by-fingerprint reconcile. Thin wrapper around
   *  `reconcileWithFingerprintsInPlace` in grid-selection-reconcile.ts. */
  reconcileWithFingerprints(
    existingIds: readonly string[],
    freshFingerprints: ReadonlyMap<string, string>,
    fallbackFirstVisibleId: string | null,
  ): void {
    const state: FingerprintReconcileState = {
      nodeIds: this._nodeIds,
      anchor: this._anchor,
      activeCursor: this._activeCursor,
      fingerprints: this._fingerprints,
      initialReconcileDone: this._initialReconcileDone,
    };
    reconcileWithFingerprintsInPlace(
      state, existingIds, freshFingerprints, fallbackFirstVisibleId,
    );
    this._nodeIds = state.nodeIds;
    this._anchor = state.anchor;
    this._activeCursor = state.activeCursor;
    this._fingerprints = state.fingerprints;
    this._initialReconcileDone = state.initialReconcileDone;
  }

  // ---- Axis-aware column selection API ----

  get columnIds(): ReadonlySet<string> {
    return this._columnSel.columns;
  }

  get columnSize(): number {
    return this._columnSel.size;
  }

  get columnAnchor(): string | null {
    return this._columnSel.anchor;
  }

  get columnActiveCursor(): string | null {
    return this._columnSel.activeCursor;
  }

  hasColumn(columnId: string): boolean {
    return this._columnSel.has(columnId);
  }

  /** Symmetry alias for `has(...)`. */
  hasRow(nodeId: string): boolean {
    return this._nodeIds.has(nodeId);
  }

  /** Plain click on a column header: replace set with {columnId}, clear
   *  any row selection, set anchor + cursor. Mutual exclusion. */
  selectColumn(columnId: string): void {
    this.clearRowInternal();
    this._columnSel.replaceWith(columnId);
    this._initialReconcileDone = true;
  }

  /** Idempotent column add. Clears row axis first. */
  addColumn(columnId: string): void {
    this.clearRowInternal();
    this._columnSel.add(columnId);
    this._initialReconcileDone = true;
  }

  removeColumn(columnId: string): void {
    const before = this._columnSel.size;
    this._columnSel.remove(columnId);
    if (this._columnSel.size !== before) this._initialReconcileDone = true;
  }

  /** Ctrl+Click on a column header. Clears row axis on first add. */
  toggleColumn(columnId: string): void {
    if (!this._columnSel.has(columnId)) this.clearRowInternal();
    this._columnSel.toggle(columnId);
    this._initialReconcileDone = true;
  }

  /** Shift+Click on a column header. */
  extendColumnRange(focusId: string, orderedColumnIds: readonly string[]): void {
    this.clearRowInternal();
    this._columnSel.extendRangeTo(focusId, orderedColumnIds);
    this._initialReconcileDone = true;
  }

  /** Programmatic range add (tests / host). */
  addColumnRange(
    anchorId: string,
    focusId: string,
    orderedColumnIds: readonly string[],
  ): void {
    this.clearRowInternal();
    this._columnSel.addRange(anchorId, focusId, orderedColumnIds);
    this._initialReconcileDone = true;
  }

  setColumnAnchor(columnId: string | null): void {
    this._columnSel.setAnchor(columnId);
  }

  setColumnActiveCursor(columnId: string | null): void {
    this._columnSel.setActiveCursor(columnId);
  }

  /** Drop every column entry + anchor/cursor. Does NOT touch rows. */
  clearColumns(): void {
    this._columnSel.clear();
  }

  /** Drop column entries whose parent nodeId no longer exists. Column
   *  ids are synthesized (`${parent}#col/...`) so the engine never
   *  emits them directly; the parent-existence check is the only
   *  reconcile criterion. */
  reconcileColumns(existingParentIds: ReadonlySet<string>): void {
    this._columnSel.reconcile(existingParentIds);
  }

  /** Debug invariant check. Throws on violation. Tests call this
   *  directly after every mutation. */
  assertInvariants(): void {
    if (this._nodeIds.size > 0 && this._columnSel.size > 0) {
      throw new Error('GridSelectionModel: rows and columns both non-empty');
    }
    this._columnSel.assertInvariants();
  }

  /** Reset to fresh-open state; next reconcile behaves like the very
   *  first (no fallback to first visible id). */
  clear(): void {
    this.clearInternal();
    this._fingerprints = new Map();
    this._columnSel.clear();
    this._initialReconcileDone = false;
  }

  private clearInternal(): void {
    this._nodeIds = new Set();
    this._anchor = null;
    this._activeCursor = null;
  }

  /** Drop row state without touching fingerprints / columns / initial
   *  flag. Used by column-adding mutators to enforce mutual exclusion. */
  private clearRowInternal(): void {
    if (this._nodeIds.size === 0 && this._anchor === null && this._activeCursor === null) {
      return;
    }
    this._nodeIds = new Set();
    this._anchor = null;
    this._activeCursor = null;
  }

  /**
   * After a toggle that removed the current cursor, pick a replacement.
   * Prefers the anchor when it survived; otherwise any remaining id.
   * Called only when the set is guaranteed non-empty.
   */
  private pickFallbackCursor(removedId: string): string {
    if (this._anchor !== null && this._anchor !== removedId && this._nodeIds.has(this._anchor)) {
      return this._anchor;
    }
    const first = this._nodeIds.values().next().value;
    return first as string;
  }
}
