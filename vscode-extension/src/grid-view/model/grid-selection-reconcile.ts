/**
 * Fingerprint-reconcile algorithm extracted from `grid-selection.ts` to
 * keep both files under the project's 500-line ceiling. Pure logic —
 * no class; mutates the caller's state object in place. See
 * `GridSelectionModel.reconcileWithFingerprints` for the thin wrapper
 * that forwards to this function.
 *
 * Algorithm (canonical):
 *   1. Build reverse index `Map<fingerprint, freshNodeId>` from the
 *      fresh fingerprint map; first fresh id in doc order wins on
 *      duplicate fp.
 *   2. For each currently-selected id:
 *        (a) IDENTITY: id in `existingIds` AND (no fp to compare OR
 *            oldFp === freshFp) → keep at same id.
 *        (b) REMAP: else if oldFp has a hit in reverse index →
 *            replace with that fresh id.
 *        (c) DROP.
 *   3. Rebuild fingerprint map under new ids; remap anchor + cursor
 *      the same way.
 *   4. When the remapped selection is empty AND this is the first
 *      reconcile on a fresh doc, stay empty (skip fallback). Otherwise
 *      fall back to `fallbackFirstVisibleId`.
 */

/** Mutable state bag operated on by `reconcileWithFingerprintsInPlace`. */
export interface FingerprintReconcileState {
  nodeIds: Set<string>;
  anchor: string | null;
  activeCursor: string | null;
  fingerprints: Map<string, string>;
  initialReconcileDone: boolean;
}

export function reconcileWithFingerprintsInPlace(
  state: FingerprintReconcileState,
  existingIds: readonly string[],
  freshFingerprints: ReadonlyMap<string, string>,
  fallbackFirstVisibleId: string | null,
): void {
  const existingSet = new Set(existingIds);
  const freshFpToId = new Map<string, string>();
  for (const id of existingIds) {
    const fp = freshFingerprints.get(id);
    if (fp === undefined) continue;
    if (!freshFpToId.has(fp)) freshFpToId.set(fp, id);
  }
  const oldFingerprints = state.fingerprints;
  const newSelection = new Map<string, string | undefined>();
  const addedVia = new Map<string, 'identity' | 'remap'>();
  for (const oldId of state.nodeIds) {
    const oldFp = oldFingerprints.get(oldId);
    const freshFp = freshFingerprints.get(oldId);
    if (existingSet.has(oldId)) {
      const fpMismatch =
        oldFp !== undefined && freshFp !== undefined && oldFp !== freshFp;
      if (!fpMismatch) {
        if (!newSelection.has(oldId)) {
          newSelection.set(oldId, oldFp ?? freshFp);
          addedVia.set(oldId, 'identity');
        }
        continue;
      }
    }
    if (oldFp !== undefined) {
      const freshId = freshFpToId.get(oldFp);
      if (freshId !== undefined) {
        if (!newSelection.has(freshId) || addedVia.get(freshId) === 'remap') {
          newSelection.set(freshId, oldFp);
          if (!addedVia.has(freshId)) addedVia.set(freshId, 'remap');
        }
      }
    }
  }
  const survivingOrdered: string[] = [];
  for (const id of existingIds) {
    if (newSelection.has(id)) survivingOrdered.push(id);
  }
  const remapOne = (oldId: string | null): string | null => {
    if (oldId === null) return null;
    if (newSelection.has(oldId)) return oldId;
    const oldFp = oldFingerprints.get(oldId);
    if (oldFp !== undefined) {
      const freshId = freshFpToId.get(oldFp);
      if (freshId !== undefined && newSelection.has(freshId)) return freshId;
    }
    return null;
  };
  if (survivingOrdered.length === 0) {
    // First reconcile on a fresh doc: stay empty.
    if (!state.initialReconcileDone) {
      state.nodeIds = new Set();
      state.anchor = null;
      state.activeCursor = null;
      state.fingerprints = new Map();
      state.initialReconcileDone = true;
      return;
    }
    if (fallbackFirstVisibleId !== null) {
      state.nodeIds = new Set([fallbackFirstVisibleId]);
      state.anchor = fallbackFirstVisibleId;
      state.activeCursor = fallbackFirstVisibleId;
      state.fingerprints = new Map();
      const fresh = freshFingerprints.get(fallbackFirstVisibleId);
      if (fresh !== undefined) {
        state.fingerprints.set(fallbackFirstVisibleId, fresh);
      }
    } else {
      state.nodeIds = new Set();
      state.anchor = null;
      state.activeCursor = null;
      state.fingerprints = new Map();
    }
    state.initialReconcileDone = true;
    return;
  }
  state.nodeIds = new Set(survivingOrdered);
  const nextFp = new Map<string, string>();
  for (const id of survivingOrdered) {
    const fp = newSelection.get(id);
    if (fp !== undefined) {
      nextFp.set(id, fp);
    } else {
      const fresh = freshFingerprints.get(id);
      if (fresh !== undefined) nextFp.set(id, fresh);
    }
  }
  state.fingerprints = nextFp;
  const newCursor =
    remapOne(state.activeCursor) ?? remapOne(state.anchor) ?? survivingOrdered[0];
  const newAnchor = remapOne(state.anchor) ?? newCursor;
  state.activeCursor = newCursor;
  state.anchor = newAnchor;
  state.initialReconcileDone = true;
}
