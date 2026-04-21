import { strict as assert } from 'assert';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';

function assertInvariants(sel: GridSelectionModel): void {
  if (sel.size === 0) {
    assert.strictEqual(sel.anchor, null, 'I1: empty ⇒ anchor null');
    assert.strictEqual(sel.activeCursor, null, 'I1: empty ⇒ activeCursor null');
    return;
  }
  assert.notStrictEqual(sel.anchor, null, 'I1: non-empty ⇒ anchor not null');
  assert.notStrictEqual(sel.activeCursor, null, 'I1: non-empty ⇒ activeCursor not null');
  assert.ok(sel.has(sel.anchor as string), 'I2: anchor ∈ nodeIds');
  assert.ok(sel.has(sel.activeCursor as string), 'I2: activeCursor ∈ nodeIds');
}

suite('GridSelectionModel', () => {
  test('empty construction yields null pointers and zero size', () => {
    const sel = new GridSelectionModel();
    assert.strictEqual(sel.size, 0);
    assert.strictEqual(sel.anchor, null);
    assert.strictEqual(sel.activeCursor, null);
    assertInvariants(sel);
  });

  test('constructor with initial id establishes single-row selection', () => {
    const sel = new GridSelectionModel('/root[1]/a[1]');
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.anchor, '/root[1]/a[1]');
    assert.strictEqual(sel.activeCursor, '/root[1]/a[1]');
    assert.ok(sel.has('/root[1]/a[1]'));
    assertInvariants(sel);
  });

  test('replaceWith sets all three pointers to the same id', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith('/n[1]');
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.anchor, '/n[1]');
    assert.strictEqual(sel.activeCursor, '/n[1]');
    assertInvariants(sel);
  });

  test('two replaceWith calls leave size 1 with updated anchor+cursor', () => {
    const sel = new GridSelectionModel('/n[1]');
    sel.replaceWith('/n[2]');
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.anchor, '/n[2]');
    assert.strictEqual(sel.activeCursor, '/n[2]');
    assert.ok(!sel.has('/n[1]'));
    assertInvariants(sel);
  });

  test('toggle adds then removes same id reaches empty state', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/n[1]');
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.anchor, '/n[1]');
    sel.toggle('/n[1]');
    assert.strictEqual(sel.size, 0);
    assert.strictEqual(sel.anchor, null);
    assert.strictEqual(sel.activeCursor, null);
    assertInvariants(sel);
  });

  test('toggle that empties then re-adds establishes a new anchor', () => {
    const sel = new GridSelectionModel('/n[1]');
    sel.toggle('/n[1]');
    assert.strictEqual(sel.size, 0);
    sel.toggle('/n[7]');
    assert.strictEqual(sel.anchor, '/n[7]');
    assert.strictEqual(sel.activeCursor, '/n[7]');
    assertInvariants(sel);
  });

  test('toggle adding into non-empty preserves anchor, updates cursor', () => {
    const sel = new GridSelectionModel('/n[1]');
    sel.toggle('/n[2]');
    assert.strictEqual(sel.anchor, '/n[1]');
    assert.strictEqual(sel.activeCursor, '/n[2]');
    assert.strictEqual(sel.size, 2);
    sel.toggle('/n[3]');
    assert.strictEqual(sel.anchor, '/n[1]');
    assert.strictEqual(sel.activeCursor, '/n[3]');
    assert.strictEqual(sel.size, 3);
    assertInvariants(sel);
  });

  test('toggle removing non-cursor, non-anchor id keeps anchor and cursor', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.toggle('/c');
    // anchor=/a, cursor=/c, size=3
    sel.toggle('/b');
    assert.strictEqual(sel.anchor, '/a');
    assert.strictEqual(sel.activeCursor, '/c');
    assert.strictEqual(sel.size, 2);
    assertInvariants(sel);
  });

  test('extendRangeTo with contiguous visible list selects inclusive slice', () => {
    const sel = new GridSelectionModel('/a');
    const visible = ['/a', '/b', '/c', '/d', '/e'];
    sel.extendRangeTo('/d', visible);
    assert.deepStrictEqual(Array.from(sel.nodeIds), ['/a', '/b', '/c', '/d']);
    assert.strictEqual(sel.anchor, '/a');
    assert.strictEqual(sel.activeCursor, '/d');
    assertInvariants(sel);
  });

  test('extendRangeTo reversed direction produces the same slice', () => {
    const sel = new GridSelectionModel('/d');
    const visible = ['/a', '/b', '/c', '/d', '/e'];
    sel.extendRangeTo('/a', visible);
    assert.deepStrictEqual(Array.from(sel.nodeIds).sort(), ['/a', '/b', '/c', '/d']);
    assert.strictEqual(sel.anchor, '/d');
    assert.strictEqual(sel.activeCursor, '/a');
    assertInvariants(sel);
  });

  test('extendRangeTo when anchor is not in visible list treats target as anchor', () => {
    const sel = new GridSelectionModel('/gone');
    const visible = ['/a', '/b', '/c'];
    sel.extendRangeTo('/b', visible);
    assert.strictEqual(sel.anchor, '/b');
    assert.strictEqual(sel.activeCursor, '/b');
    assert.deepStrictEqual(Array.from(sel.nodeIds), ['/b']);
    assertInvariants(sel);
  });

  test('collapseToCursor preserves cursor and discards every other id', () => {
    const sel = new GridSelectionModel('/a');
    sel.extendRangeTo('/d', ['/a', '/b', '/c', '/d']);
    sel.collapseToCursor();
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.anchor, '/d');
    assert.strictEqual(sel.activeCursor, '/d');
    assert.ok(sel.has('/d'));
    assertInvariants(sel);
  });

  test('collapseToCursor on empty selection is a no-op', () => {
    const sel = new GridSelectionModel();
    sel.collapseToCursor();
    assertInvariants(sel);
    assert.strictEqual(sel.size, 0);
  });

  test('selectAll over a 5-id visible list yields size 5 with preserved cursor', () => {
    const sel = new GridSelectionModel('/c');
    const visible = ['/a', '/b', '/c', '/d', '/e'];
    sel.selectAll(visible);
    assert.strictEqual(sel.size, 5);
    assert.strictEqual(sel.activeCursor, '/c');
    assert.strictEqual(sel.anchor, '/c');
    assertInvariants(sel);
  });

  test('selectAll from empty selection moves cursor and anchor to first visible', () => {
    const sel = new GridSelectionModel();
    sel.selectAll(['/a', '/b', '/c']);
    assert.strictEqual(sel.size, 3);
    assert.strictEqual(sel.anchor, '/a');
    assert.strictEqual(sel.activeCursor, '/a');
    assertInvariants(sel);
  });

  test('reconcile drops missing ids and keeps surviving cursor', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.toggle('/c'); // cursor=/c, anchor=/a
    sel.reconcile(['/a', '/c', '/x'], null);
    assert.strictEqual(sel.size, 2);
    assert.ok(sel.has('/a'));
    assert.ok(sel.has('/c'));
    assert.ok(!sel.has('/b'));
    assert.strictEqual(sel.activeCursor, '/c');
    assert.strictEqual(sel.anchor, '/a');
    assertInvariants(sel);
  });

  test('reconcile falls back cursor to anchor when cursor is dropped', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.toggle('/c'); // cursor=/c, anchor=/a
    sel.reconcile(['/a', '/b'], null);
    assert.strictEqual(sel.activeCursor, '/a');
    assert.strictEqual(sel.anchor, '/a');
    assertInvariants(sel);
  });

  test('reconcile falls back to first surviving id when anchor is dropped', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.toggle('/c'); // anchor=/a, cursor=/c
    sel.reconcile(['/b', '/c'], null);
    // /a (anchor) dropped, /c (cursor) survived ⇒ cursor stays /c, anchor ← cursor
    assert.strictEqual(sel.activeCursor, '/c');
    assert.strictEqual(sel.anchor, '/c');
    assertInvariants(sel);
  });

  test('reconcile falls back to fallbackFirstVisibleId when all ids drop', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.reconcile(['/z'], '/z');
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.anchor, '/z');
    assert.strictEqual(sel.activeCursor, '/z');
    assertInvariants(sel);
  });

  test('reconcile with no survivors and null fallback yields empty selection', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.reconcile([], null);
    assert.strictEqual(sel.size, 0);
    assert.strictEqual(sel.anchor, null);
    assert.strictEqual(sel.activeCursor, null);
    assertInvariants(sel);
  });

  test('toJSON returns a plain-object snapshot of the current state', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    const snap = sel.toJSON();
    assert.deepStrictEqual(snap.nodeIds.sort(), ['/a', '/b']);
    assert.strictEqual(snap.anchor, '/a');
    assert.strictEqual(snap.activeCursor, '/b');
  });

  // ---- addIds: selection growth ----

  test('addIds merges into a non-empty selection without changing anchor or cursor', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b'); // anchor=/a, cursor=/b
    sel.addIds(['/c', '/d']);
    assert.strictEqual(sel.size, 4);
    assert.strictEqual(sel.anchor, '/a');
    assert.strictEqual(sel.activeCursor, '/b');
    assertInvariants(sel);
  });

  test('addIds is idempotent for ids already present', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.addIds(['/a', '/b']);
    assert.strictEqual(sel.size, 2);
    assert.strictEqual(sel.anchor, '/a');
    assert.strictEqual(sel.activeCursor, '/b');
  });

  test('addIds with empty array is a no-op', () => {
    const sel = new GridSelectionModel('/a');
    sel.addIds([]);
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.anchor, '/a');
    assert.strictEqual(sel.activeCursor, '/a');
  });

  test('addIds on an empty selection establishes anchor=cursor=ids[0]', () => {
    const sel = new GridSelectionModel();
    sel.addIds(['/x', '/y']);
    assert.strictEqual(sel.size, 2);
    assert.strictEqual(sel.anchor, '/x');
    assert.strictEqual(sel.activeCursor, '/x');
    assertInvariants(sel);
  });
});

suite('reconcile — cursor fallback prefers surviving selection id in document order', () => {
  test('cursor dropped + anchor dropped → cursor falls back to FIRST surviving id in doc order', () => {
    const sel = new GridSelectionModel();
    // Select ids in a non-doc order (toggling): cursor=/c, anchor=/a.
    sel.toggle('/c');
    sel.toggle('/a');
    sel.toggle('/b');
    // doc order of renderable tree is /root, /a, /b, /c, /d.
    // After re-render: /a and /c are dropped, /b survives. Anchor /a
    // dropped; cursor /b... wait we set cursor to /b via last toggle.
    // Rebuild scenario: cursor /c implied via another toggle. Redo.
    sel.replaceWith('/c');
    sel.toggle('/a'); // anchor=/c, cursor=/a
    sel.toggle('/b'); // cursor=/b, anchor=/c
    // Now reconcile where ONLY /a and /d survive (cursor /b AND anchor
    // /c both dropped). Doc order: /a, /d. First surviving selection id
    // in doc order is /a.
    sel.reconcile(['/root', '/a', '/d'], '/root');
    assert.equal(sel.size, 1);
    assert.equal(sel.activeCursor, '/a');
    assert.equal(sel.anchor, '/a');
  });

  test('cursor survives → anchor and cursor preserved (no fallback)', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.toggle('/c');
    // anchor=/a, cursor=/c
    sel.reconcile(['/root', '/a', '/c', '/d'], '/root');
    assert.equal(sel.activeCursor, '/c');
    assert.equal(sel.anchor, '/a');
  });

  test('selection set empty AFTER reconcile → falls back to fallbackFirstVisibleId', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/a');
    sel.toggle('/b');
    // Neither /a nor /b survive; fallback kicks in.
    sel.reconcile(['/root', '/x', '/y'], '/root');
    assert.equal(sel.activeCursor, '/root');
    assert.equal(sel.anchor, '/root');
  });

  test('ordered-array API is preferred over Set iteration order', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/z'); // Set iteration order inserts /z first
    sel.toggle('/a');
    // Cursor is /a (last toggle). Anchor is /z. Both dropped.
    // If existingIds is ['/a', '/z'], first surviving in doc order is /a.
    sel.reconcile([/* only non-selection ids */ '/other'], null);
    // That call drops everything, so not useful. Try case with survivors
    // in non-insertion order:
    sel.toggle('/a');
    sel.toggle('/z');
    sel.toggle('/b');
    sel.toggle('/c'); // cursor=/c, anchor=/a
    // Drop /a and /c. /b and /z survive. Doc order: /b (before /z).
    sel.reconcile(['/root', '/b', '/z'], '/root');
    assert.equal(sel.activeCursor, '/b', 'doc-order fallback picks /b, not Set-order /z');
    assert.equal(sel.anchor, '/b');
  });
});

suite('selectAll — preserves existing cursor and anchor when they remain in the visible set', () => {
  test('cursor on /c is preserved when /c is in visibleIds', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.toggle('/c'); // anchor=/a, cursor=/c
    sel.selectAll(['/a', '/b', '/c', '/d', '/e']);
    assert.equal(sel.size, 5);
    assert.equal(sel.activeCursor, '/c', 'cursor preserved');
    assert.equal(sel.anchor, '/a', 'anchor preserved');
  });

  test('anchorHint is honoured when the previous cursor was dropped', () => {
    const sel = new GridSelectionModel('/old');
    sel.selectAll(['/a', '/b', '/c'], '/b');
    assert.equal(sel.activeCursor, '/b', 'anchorHint used when prev cursor is outside set');
    assert.equal(sel.anchor, '/b');
  });

  test('anchorHint outside visibleIds falls through to first visible id', () => {
    const sel = new GridSelectionModel('/old');
    sel.selectAll(['/a', '/b', '/c'], '/not-present');
    assert.equal(sel.activeCursor, '/a');
    assert.equal(sel.anchor, '/a');
  });

  test('anchorHint is ignored when the existing cursor + anchor are still visible', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.toggle('/c'); // anchor=/a, cursor=/c
    sel.selectAll(['/a', '/b', '/c', '/d'], '/d');
    // Existing cursor + anchor survive → anchorHint must not override.
    assert.equal(sel.activeCursor, '/c');
    assert.equal(sel.anchor, '/a');
  });
});

suite('plain-click auto-grow — replaceWith followed by addIds grows selection to include visible descendants', () => {
  // Pure model test: the view's auto-grow walk produces a descendant id
  // list which the controller passes to `addIds`. The selection-model
  // level contract is: replaceWith(id) then addIds(descendants) yields
  // {id, ...descendants}, anchor+cursor both on id.
  test('plain click on expanded header auto-includes visible descendants', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith('/groupA');
    // Simulate view.getVisibleDescendantIds returning 3 visible descendants.
    sel.addIds(['/groupA/a1', '/groupA/a2', '/groupA/a3']);
    assert.equal(sel.size, 4);
    assert.equal(sel.anchor, '/groupA');
    assert.equal(sel.activeCursor, '/groupA');
    assert.ok(sel.has('/groupA/a1'));
    assert.ok(sel.has('/groupA/a3'));
  });

  test('plain click on collapsed header / leaf does not auto-grow', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith('/leaf');
    // View.getVisibleDescendantIds returns [] for a leaf / collapsed
    // header → addIds([]) is a no-op by contract.
    sel.addIds([]);
    assert.equal(sel.size, 1);
    assert.equal(sel.activeCursor, '/leaf');
  });
});
