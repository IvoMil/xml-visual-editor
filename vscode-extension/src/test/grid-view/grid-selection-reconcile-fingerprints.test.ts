import { strict as assert } from 'assert';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';

/**
 * Content-fingerprint reconcile tests.
 *
 * Split out of grid-selection-model.test.ts to keep both files under
 * the project's 500-line ceiling.
 * Covers:
 *   - identity-preserved survival
 *   - remap-by-fingerprint for deleted-and-reindexed siblings
 *   - content-change drop
 *   - duplicate fingerprint collapse (accepted behaviour)
 *   - anchor / cursor remap
 *   - legacy (no captured fingerprints) positional survival
 *   - fallback when every id is dropped
 */
suite('content-fingerprint reconcile — selection ids survive when fingerprints match and remap when sibling indices shift', () => {
  test('fingerprint-preserved ids survive reconcile', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/a');
    sel.toggle('/b');
    const fresh = new Map<string, string>([
      ['/a', 'elA||'],
      ['/b', 'elB||'],
    ]);
    sel.captureFingerprints(fresh);
    sel.reconcileWithFingerprints(['/a', '/b'], fresh, null);
    assert.equal(sel.size, 2);
    assert.ok(sel.has('/a'));
    assert.ok(sel.has('/b'));
  });

  test('remap-by-fingerprint: deleting the middle row causes remaining selected rows to remap to their new xpath indices', () => {
    // User-reported repro (2026-04-20): selection row[1]+row[2]+row[4]
    // before deleting row[2]. After delete, content-wise a1 stays at
    // row[1] and a4 moves to row[3]. Expected post-reconcile selection:
    // {row[1], row[3]} — NOT just row[1] (the pre-fix behaviour).
    const sel = new GridSelectionModel();
    sel.toggle('/root/row[1]');
    sel.toggle('/root/row[2]');
    sel.toggle('/root/row[4]');
    const captured = new Map<string, string>([
      ['/root/row[1]', 'row||id=1'],
      ['/root/row[2]', 'row||id=2'],
      ['/root/row[4]', 'row||id=4'],
    ]);
    sel.captureFingerprints(captured);
    const fresh = new Map<string, string>([
      ['/root/row[1]', 'row||id=1'],
      ['/root/row[2]', 'row||id=3'],
      ['/root/row[3]', 'row||id=4'],
    ]);
    sel.reconcileWithFingerprints(
      ['/root/row[1]', '/root/row[2]', '/root/row[3]'],
      fresh,
      null,
    );
    assert.equal(sel.size, 2, 'row[1] identity-preserved + row[4] remapped to row[3]');
    assert.ok(sel.has('/root/row[1]'));
    assert.ok(sel.has('/root/row[3]'));
    assert.ok(!sel.has('/root/row[2]'));
    assert.ok(!sel.has('/root/row[4]'));
  });

  test('remap-by-fingerprint: deleting a sibling remaps the other selected siblings to their post-deletion positions', () => {
    // User-reported repro: selection a1+a2+a3 before deleting a2. After
    // delete, fresh tree has item[1]=a1 (stable) and item[2]=a3
    // (remapped from old item[3]).
    const sel = new GridSelectionModel();
    sel.toggle('/root/groupA/item[1]');
    sel.toggle('/root/groupA/item[2]');
    sel.toggle('/root/groupA/item[3]');
    const captured = new Map<string, string>([
      ['/root/groupA/item[1]', 'item|||a1'],
      ['/root/groupA/item[2]', 'item|||a2'],
      ['/root/groupA/item[3]', 'item|||a3'],
    ]);
    sel.captureFingerprints(captured);
    const fresh = new Map<string, string>([
      ['/root/groupA/item[1]', 'item|||a1'],
      ['/root/groupA/item[2]', 'item|||a3'],
    ]);
    sel.reconcileWithFingerprints(
      ['/root/groupA/item[1]', '/root/groupA/item[2]'],
      fresh,
      null,
    );
    assert.equal(sel.size, 2);
    assert.ok(sel.has('/root/groupA/item[1]'));
    assert.ok(sel.has('/root/groupA/item[2]'), 'a3 remapped to item[2]');
    assert.ok(!sel.has('/root/groupA/item[3]'));
  });

  test('remap: a selected row with a changed content fingerprint is dropped from selection', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/root/row[1]');
    sel.toggle('/root/row[2]');
    sel.toggle('/root/row[4]');
    const captured = new Map<string, string>([
      ['/root/row[1]', 'row||id=1'],
      ['/root/row[2]', 'row||id=2'],
      ['/root/row[4]', 'row||id=4'],
    ]);
    sel.captureFingerprints(captured);
    const fresh = new Map<string, string>([
      ['/root/row[1]', 'row||id=X'],          // fp MISMATCH → drop
      ['/root/row[2]', 'row||id=3'],
      ['/root/row[3]', 'row||id=4'],          // matches old row[4] fp
    ]);
    sel.reconcileWithFingerprints(
      ['/root/row[1]', '/root/row[2]', '/root/row[3]'],
      fresh,
      null,
    );
    assert.equal(sel.size, 1);
    assert.ok(sel.has('/root/row[3]'));
    assert.ok(!sel.has('/root/row[1]'));
  });

  test('remap: two selected ids with identical fingerprints both map to the same fresh id (documented tolerated behaviour)', () => {
    // Two old selection ids with identical fp both map to the first
    // fresh id carrying that fp. Accepted behaviour; TODO to
    // disambiguate once fp format grows a stable disambiguator.
    const sel = new GridSelectionModel();
    sel.toggle('/root/item[1]');
    sel.toggle('/root/item[2]');
    const captured = new Map<string, string>([
      ['/root/item[1]', 'item|||'],
      ['/root/item[2]', 'item|||'],
    ]);
    sel.captureFingerprints(captured);
    const fresh = new Map<string, string>([
      ['/root/item[1]', 'item|||'],
    ]);
    sel.reconcileWithFingerprints(['/root/item[1]'], fresh, null);
    assert.equal(sel.size, 1);
    assert.ok(sel.has('/root/item[1]'));
  });

  test('remap: anchor and cursor are updated to follow their rows to the new xpath positions', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/root/row[1]');
    sel.toggle('/root/row[4]');
    assert.equal(sel.anchor, '/root/row[1]');
    assert.equal(sel.activeCursor, '/root/row[4]');
    const captured = new Map<string, string>([
      ['/root/row[1]', 'row||id=1'],
      ['/root/row[4]', 'row||id=4'],
    ]);
    sel.captureFingerprints(captured);
    const fresh = new Map<string, string>([
      ['/root/row[1]', 'row||id=1'],
      ['/root/row[2]', 'row||id=3'],
      ['/root/row[3]', 'row||id=4'],
    ]);
    sel.reconcileWithFingerprints(
      ['/root/row[1]', '/root/row[2]', '/root/row[3]'],
      fresh,
      null,
    );
    assert.equal(sel.anchor, '/root/row[1]');
    assert.equal(sel.activeCursor, '/root/row[3]', 'cursor followed row[4] → row[3]');
  });

  test('ids without captured fingerprints survive positionally', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/a');
    sel.toggle('/b');
    const fresh = new Map<string, string>([
      ['/a', 'fp-a'],
      ['/b', 'fp-b'],
    ]);
    sel.reconcileWithFingerprints(['/a', '/b'], fresh, null);
    assert.equal(sel.size, 2);
  });

  test('captureFingerprints preserves existing fingerprints for already-selected ids', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/a');
    sel.captureFingerprints(new Map([['/a', 'fp-a-old']]));
    sel.captureFingerprints(new Map([['/a', 'fp-a-NEW']]));
    assert.equal(sel.getFingerprints().get('/a'), 'fp-a-old');
  });

  test('reconcileWithFingerprints falls back when all ids dropped', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/a');
    sel.captureFingerprints(new Map([['/a', 'fp-old']]));
    const fresh = new Map<string, string>([
      ['/a', 'fp-NEW'],
      ['/root', 'fp-root'],
    ]);
    sel.reconcileWithFingerprints(['/a', '/root'], fresh, '/root');
    assert.equal(sel.size, 1);
    assert.equal(sel.activeCursor, '/root');
    assert.equal(sel.anchor, '/root');
  });
});
