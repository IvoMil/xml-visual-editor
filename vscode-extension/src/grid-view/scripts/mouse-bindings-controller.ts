/**
 * GridMouseController — canonical mouse + keyboard selection logic for the
 * Grid View.
 *
 * Pure TypeScript: no DOM, no VS Code API. The webview runtime uses a JS
 * copy of this logic inlined in mouse-bindings-webview-js.ts (Option B per
 * phase 5b B.6.b — the project has no bundler, so we can't import this
 * file into the webview). Any semantic change MUST be mirrored in that
 * inline copy; the unit tests cover this class against a fake view.
 *
 * Despite the historical "Mouse" name, this controller now also owns
 * keyboard-driven multi-select primitives (B.6.c): Shift-Arrow / Shift-
 * Home / Shift-End extend ranges, Escape collapses to the cursor, and
 * Ctrl+A selects all visible rows. Renaming is deferred to avoid churn;
 * see mouse-bindings-webview-js.ts banner for the equivalent note.
 *
 * Locked decisions from DESIGN_GRID_MULTI_SELECT §0 honoured here:
 *   - Q1: selectAllVisible() uses the caller-chosen visible list.
 *   - Q2: comment rows PARTICIPATE in plain click (select), Ctrl+Click
 *         (toggle), and Shift-range extension (mouse + kbd). B.6
 *         post-verification revised the original "inert on plain click"
 *         reading — users reported it was surprising.
 *   - Q3: collapseToCursor() implements the Escape semantics.
 *   - Q4: reconcile() delegates to GridSelectionModel.reconcile().
 */
import { GridSelectionModel, GridSelectionSnapshot } from '../model/grid-selection';

/** View adapter: abstracts DOM operations so the controller stays pure. */
export interface GridView {
  /** DOM order of every visible `.g-row[data-node-id]`, comments INCLUDED. */
  getRowIds(): string[];
  /** True when the row carries the `.r-comment` class. */
  isComment(nodeId: string): boolean;
  /** Node type (e.g. 'element', 'attribute', 'comment') for host messages. */
  getNodeType(nodeId: string): string;
  /**
   * Z8 — true when the row's expand-toggle is currently expanded
   * (`data-expanded="true"`). Retained for diagnostic / host use; the
   * auto-grow trigger itself is now DOM-based (Z13) and no longer
   * consults this method — it simply calls `getVisibleDescendantIds`
   * and auto-grows when the result is non-empty.
   */
  isRowExpanded?(nodeId: string): boolean;
  /**
   * Z8 / Z13 — collect every visible descendant id of `nodeId` by
   * walking forward in DOM order. The walk is depth-based for ordinary
   * expanded element headers (children at `depth+1`) AND handles the
   * synthesized `#group` table-region header case where the `.r-trow`
   * data rows sit at the SAME `data-depth` as the `#group` header.
   * Returns an empty array when the clicked row has no visible
   * descendants (leaf / collapsed / standalone `#group` with no rows).
   */
  getVisibleDescendantIds?(nodeId: string): string[];
  /** Apply the new selection snapshot to the DOM:
   *    - every id in `snapshot.nodeIds` gets `.selected`
   *    - only `snapshot.activeCursor` gets `.cursor`
   *    - everything else is cleared. */
  applySelection(snapshot: GridSelectionSnapshot): void;
}

/** Host adapter: receives outgoing messages. */
export interface ControllerHost {
  postMessage(msg: unknown): void;
}

export interface ClickModifiers {
  ctrl: boolean;
  shift: boolean;
}

export class GridMouseController {
  private readonly selection: GridSelectionModel;

  constructor(
    private readonly view: GridView,
    private readonly host: ControllerHost,
    initialSelection?: GridSelectionModel,
  ) {
    this.selection = initialSelection ?? new GridSelectionModel();
  }

  /** Expose the underlying selection model (read-only callers only). */
  getSelection(): GridSelectionModel {
    return this.selection;
  }

  /**
   * Handle a click on a `.g-row[data-node-id]`.
   *
   * Returns true when the click mutated the selection (caller may want to
   * consider this for focus management).
   *
   * B.6 post-verification fix: plain click on a comment row now DOES
   * select it (was previously inert per the original Q2 reading). Q2
   * participation in Ctrl+Click / Shift-range extension is unchanged.
   * The back-compat `nodeSelected` broadcast is still emitted so helper
   * panels that listen for it continue to work — the comment `nodeId`
   * is a plain XPath and callers that cannot handle a comment target
   * are responsible for filtering by `nodeType === 'comment'`.
   */
  onRowClick(nodeId: string, mods: ClickModifiers): boolean {
    const plain = !mods.ctrl && !mods.shift;

    if (plain) {
      this.selection.replaceWith(nodeId);
      // Z8 / Z13 — plain click on any header whose visible descendant
      // walk is non-empty auto-grows the selection to every visible
      // descendant. The `isRowExpanded` gate was removed in round-4
      // Z13 so synthesized `#group` headers (which have no model-level
      // expansion state but ARE followed in the DOM by `.r-trow` rows)
      // also auto-grow. A leaf or a collapsed header yields an empty
      // descendant list and therefore does NOT auto-grow.
      if (this.view.getVisibleDescendantIds) {
        const descendants = this.view.getVisibleDescendantIds(nodeId);
        if (descendants.length > 0) {
          this.selection.addIds(descendants);
        }
      }
    } else if (mods.ctrl) {
      // Ctrl takes precedence over Shift when both held (match webview
      // convention in existing single-select code).
      //
      // Z12 — Ctrl+click on a header whose visible descendant walk is
      // non-empty is treated as a symmetric "toggle subtree":
      //   - if the header was NOT selected before the click, it (and
      //     every visible descendant) is union-added to the selection;
      //   - if the header WAS selected before the click, it and every
      //     visible descendant are removed in a single pass — matching
      //     the plain-click auto-grow so the user can undo a Ctrl+click
      //     subtree-add with another Ctrl+click on the same header.
      // Leaves and collapsed headers fall back to the original single-id
      // toggle behaviour (descendants is empty).
      const wasSelected = this.selection.has(nodeId);
      const descendants = this.view.getVisibleDescendantIds
        ? this.view.getVisibleDescendantIds(nodeId)
        : [];
      if (wasSelected && descendants.length > 0) {
        this.selection.removeIds([nodeId, ...descendants]);
      } else {
        this.selection.toggle(nodeId);
        if (!wasSelected && descendants.length > 0) {
          this.selection.addIds(descendants);
        }
      }
    } else {
      // Shift-only
      this.selection.extendRangeTo(nodeId, this.view.getRowIds());
    }

    this.applyAndBroadcast();
    return true;
  }

  /** Re-apply the current selection to the DOM (no broadcast). Used when
   *  the DOM has just been re-rendered with the same ids. */
  reapply(): void {
    this.view.applySelection(this.selection.toJSON());
  }

  /** Q4 / Z5c: reconcile the selection against a freshly rendered tree.
   *  `existingIds` MUST be in document / DOM order so the model can fall
   *  the cursor back to the first surviving selection id in doc order
   *  when the cursor was dropped and the anchor was also dropped. */
  reconcile(existingIds: readonly string[], fallbackFirstVisibleId: string | null): void {
    this.selection.reconcile(existingIds, fallbackFirstVisibleId);
    this.view.applySelection(this.selection.toJSON());
  }

  /** Replace the selection with a single id (programmatic, e.g. from host
   *  `selectNode` messages). No broadcast — the host already knows. */
  setSingle(nodeId: string): void {
    this.selection.replaceWith(nodeId);
    this.view.applySelection(this.selection.toJSON());
  }

  /**
   * B.6.c — Shift+Arrow / Shift+Home / Shift+End from the webview.
   *
   * Extends the range from the current anchor (or establishes `nodeId` as
   * the anchor if none) to `nodeId`, using `orderedVisibleIds` to drive
   * the inclusive slice. Comments are included when the caller includes
   * them in the ordered list (Q2). Broadcasts after applying.
   */
  extendRangeTo(nodeId: string, orderedVisibleIds: readonly string[]): void {
    this.selection.extendRangeTo(nodeId, orderedVisibleIds);
    this.applyAndBroadcast();
  }

  /**
   * B.6.c — Escape collapses the multi-row selection back to just the
   * active cursor (Q3). No-op when the selection is already empty.
   * Broadcasts after applying.
   */
  collapseToCursor(): void {
    if (this.selection.size === 0) {
      return;
    }
    this.selection.collapseToCursor();
    this.applyAndBroadcast();
  }

  /**
   * B.6.c — Ctrl+A / Cmd+A selects every visible row the caller supplies
   * (Q1). The caller is responsible for bailing out when focus is inside
   * an editable cell (see `isInEditableContext`). Broadcasts after
   * applying. No-op when `visibleIds` is empty.
   */
  selectAllVisible(visibleIds: readonly string[]): void {
    if (visibleIds.length === 0) {
      return;
    }
    this.selection.selectAll(visibleIds);
    this.applyAndBroadcast();
  }

  /**
   * B.6.e — Compute which selected ids would change state under a
   * direction-guarded batch `+` / `-` operation (Q5). Pure helper: does
   * NOT mutate the selection and does NOT post messages; the caller (the
   * webview glue) forwards the resulting ids to the host which owns
   * `GridNode.isExpanded` and applies the flips in a single re-render.
   *
   *   - `+`: returns ids that are currently collapsed AND expandable.
   *   - `-`: returns ids that are currently expanded.
   *
   * Comments are filtered via `view.isComment` (Invariant: `+`/`-` on a
   * comment row is always a no-op per Q2). Leaves are filtered via the
   * `hasChildren` predicate returning false.
   *
   * Q6: the caller passes the full selection set regardless of DOM
   * visibility. Hidden descendants of collapsed ancestors still flip
   * state silently. If the behaviour is later revised to "visible only",
   * the caller can pre-filter the list without touching this method.
   */
  batchToggleExpand(
    direction: '+' | '-',
    isExpanded: (nodeId: string) => boolean,
    hasChildren: (nodeId: string) => boolean,
  ): string[] {
    const changed: string[] = [];
    for (const id of this.selection.nodeIds) {
      if (this.view.isComment(id)) {
        continue;
      }
      if (!hasChildren(id)) {
        continue;
      }
      const expanded = isExpanded(id);
      if (direction === '+' && !expanded) {
        changed.push(id);
      } else if (direction === '-' && expanded) {
        changed.push(id);
      }
    }
    return changed;
  }

  /**
   * B.6 second-round Issue X — selection growth after a batch expand.
   *
   * Adds `ids` to the selection without changing `anchor` or
   * `activeCursor`. Applies the snapshot to the DOM and broadcasts so
   * helper panels / status bar see the grown size.
   *
   * No-op when `ids` is empty.
   */
  growSelection(ids: readonly string[]): void {
    if (ids.length === 0) {
      return;
    }
    this.selection.addIds(ids);
    this.applyAndBroadcast();
  }

  /**
   * B.1.e — symmetric bulk-remove subtree for future use; see `onRowClick`
   * for the current invocation path.
   */
  /**
   * B.1.d — toggle-strip icon click (table-mode / flip). Pure pass-through
   * to the host: no selection mutation (the outer webview click delegation
   * also calls `stopPropagation` so this path is never entered for a
   * toggle-icon click). Retained here so the controller + webview twin
   * stay structurally aligned — the inline JS twin exposes the same
   * method and the outer script can route through it if desired.
   */
  onToggleIconClick(parentNodeId: string, kind: 'tableMode' | 'flip', value: boolean): void {
    this.host.postMessage({
      type: 'toggleStateChanged',
      parentNodeId,
      kind,
      value,
    });
  }

  /**
   * B.1.h — click on a column-header cell ([data-column-id] in the
   * column-headers row, or the leading label cell of a flipped row).
   *
   * Semantics mirror `onRowClick`:
   *   - plain            → `selectColumn(columnId)` (clears rows, sets anchor+cursor)
   *   - Ctrl/Cmd+Click   → `toggleColumn(columnId)` (clears rows on first add)
   *   - Shift+Click      → `extendColumnRange(columnId, orderedColumnIds)` when
   *                        a column anchor exists; else plain select.
   *
   * Mutual exclusion with the row axis is enforced by the model (I3);
   * this handler does not need to clear rows explicitly.
   *
   * Returns true when the click mutated the selection.
   */
  onColumnClick(
    columnId: string,
    orderedColumnIds: readonly string[],
    mods: ClickModifiers,
  ): boolean {
    if (mods.ctrl) {
      this.selection.toggleColumn(columnId);
    } else if (mods.shift) {
      if (this.selection.columnAnchor !== null) {
        this.selection.extendColumnRange(columnId, orderedColumnIds);
      } else {
        this.selection.selectColumn(columnId);
      }
    } else {
      this.selection.selectColumn(columnId);
    }
    this.applyAndBroadcast();
    return true;
  }

  /** B.1.h — Shift+Left/Right on the column axis. Extends the current
   *  column range by one step in `orderedColumnIds`, relative to the
   *  column active cursor. No-op when no column is currently selected. */
  extendColumnCursor(direction: -1 | 1, orderedColumnIds: readonly string[]): void {
    const cur = this.selection.columnActiveCursor;
    if (cur === null) return;
    const idx = orderedColumnIds.indexOf(cur);
    if (idx === -1) return;
    const targetIdx = Math.max(0, Math.min(orderedColumnIds.length - 1, idx + direction));
    this.selection.extendColumnRange(orderedColumnIds[targetIdx], orderedColumnIds);
    this.applyAndBroadcast();
  }

  /** B.1.h — clear every axis. Escape in column-axis mode uses this. */
  clearSelection(): void {
    this.selection.clear();
    this.applyAndBroadcast();
  }

  private applyAndBroadcast(): void {
    const snap = this.selection.toJSON();
    this.view.applySelection(snap);
    this.host.postMessage({
      type: 'selectionChanged',
      selection: snap,
      activeNodeType:
        snap.activeCursor === null ? null : this.view.getNodeType(snap.activeCursor),
    });
    // Back-compat: helper panels still listen for `nodeSelected` on the
    // active cursor. Skip when there is no cursor (empty selection).
    if (snap.activeCursor !== null) {
      this.host.postMessage({
        type: 'nodeSelected',
        nodeId: snap.activeCursor,
        nodeType: this.view.getNodeType(snap.activeCursor),
      });
    }
  }
}

/**
 * Minimal `Element`-like shape the bailout test needs. Keeps this helper
 * independent of the DOM typings so it can be called from pure unit tests
 * with a fake object carrying a `closest` method.
 */
export interface ClosestCapable {
  closest(selectors: string): unknown;
}

/**
 * B.6.c — Ctrl+A must NOT hijack keystrokes when the user is typing in a
 * cell editor (`<input>`, `<textarea>`, or `contenteditable` host). The
 * webview script calls this helper with `event.target` before invoking
 * `selectAllVisible`. Null / non-Element targets return `false`.
 */
export function isInEditableContext(target: ClosestCapable | null | undefined): boolean {
  if (!target || typeof target.closest !== 'function') {
    return false;
  }
  return target.closest('input, textarea, [contenteditable="true"]') !== null;
}
