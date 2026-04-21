/**
 * Session-only toggle state for the Grid View webview.
 *
 * Two orthogonal per-parent flags:
 *   - tableMode: user override of the engine's "render as table"
 *                default for a same-shape repeated-sibling run. Absent
 *                entry ⇒ use `engineDefault`.
 *   - flip: renderer-side row/column interchange. Absent entry ⇒ false.
 *
 * State lives in plain in-memory Maps on a single instance created once
 * per webview session (see `GridViewPanel`). No persistence (no Memento,
 * no XML PI). Lost on webview dispose.
 */
export interface ToggleState {
  /** Effective table-mode flag for a parent: user override if present,
   *  else `engineDefault` (true for hybrid/scalar candidates). */
  isTableModeOn(parentNodeId: string, engineDefault: boolean): boolean;
  /** Explicitly set the user override for a parent. */
  setTableMode(parentNodeId: string, on: boolean): void;
  /** Effective flip flag for a parent. Default false. */
  isFlipped(parentNodeId: string): boolean;
  /** Explicitly set the flip flag for a parent. */
  setFlipped(parentNodeId: string, flipped: boolean): void;
  /** Raw lookup of a table-mode override — undefined when no override
   *  has been stored. Used by the renderer to resolve a per-run
   *  toggle key with fallback to the owning parent's wider key. */
  peekTableMode(key: string): boolean | undefined;
  /** Raw lookup of a flip override — undefined when no override has
   *  been stored. */
  peekFlipped(key: string): boolean | undefined;
}

class ToggleStateImpl implements ToggleState {
  private readonly tableMode = new Map<string, boolean>();
  private readonly flipMode = new Map<string, boolean>();

  isTableModeOn(parentNodeId: string, engineDefault: boolean): boolean {
    const v = this.tableMode.get(parentNodeId);
    return v === undefined ? engineDefault : v;
  }

  setTableMode(parentNodeId: string, on: boolean): void {
    this.tableMode.set(parentNodeId, on);
  }

  isFlipped(parentNodeId: string): boolean {
    return this.flipMode.get(parentNodeId) === true;
  }

  setFlipped(parentNodeId: string, flipped: boolean): void {
    this.flipMode.set(parentNodeId, flipped);
  }

  peekTableMode(key: string): boolean | undefined {
    return this.tableMode.get(key);
  }

  peekFlipped(key: string): boolean | undefined {
    return this.flipMode.get(key);
  }
}

export function createToggleState(): ToggleState {
  return new ToggleStateImpl();
}
