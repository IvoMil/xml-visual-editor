/**
 * Pure unit tests for GridSelectionModel.removeIds — the symmetric
 * bulk-remove primitive for the Ctrl+click "toggle subtree" flow.
 * Split out of grid-selection-model.test.ts to keep that file under
 * the 500-line soft cap.
 */
import { strict as assert } from 'assert';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';

suite('GridSelectionModel.removeIds — symmetric subtree removal', () => {
  test('removeIds drops every listed id and falls cursor/anchor back to survivor', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/keep');          // anchor=/keep, cursor=/keep
    sel.toggle('/header');        // cursor=/header
    sel.addIds(['/header/c1', '/header/c2']); // anchor unchanged
    assert.equal(sel.size, 4);
    sel.removeIds(['/header', '/header/c1', '/header/c2']);
    assert.deepEqual(Array.from(sel.nodeIds), ['/keep']);
    assert.equal(sel.anchor, '/keep');
    assert.equal(sel.activeCursor, '/keep');
  });

  test('removeIds is a no-op on empty ids', () => {
    const sel = new GridSelectionModel('/a');
    sel.removeIds([]);
    assert.equal(sel.size, 1);
    assert.equal(sel.activeCursor, '/a');
    assert.equal(sel.anchor, '/a');
  });

  test('removeIds of the whole selection clears anchor + cursor (I1)', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.removeIds(['/a', '/b']);
    assert.equal(sel.size, 0);
    assert.equal(sel.anchor, null);
    assert.equal(sel.activeCursor, null);
  });

  test('removeIds ignores ids not in the selection', () => {
    const sel = new GridSelectionModel('/a');
    sel.toggle('/b');
    sel.removeIds(['/not-there', '/also-missing']);
    assert.equal(sel.size, 2);
    assert.ok(sel.has('/a'));
    assert.ok(sel.has('/b'));
  });

  test('removeIds falls back to anchor when only the cursor was removed', () => {
    const sel = new GridSelectionModel('/a'); // anchor=/a, cursor=/a
    sel.toggle('/b');                         // cursor=/b
    sel.toggle('/c');                         // cursor=/c
    sel.removeIds(['/c']);                    // cursor gone
    assert.equal(sel.activeCursor, '/a');     // anchor survived → cursor=/a
    assert.equal(sel.anchor, '/a');
  });
});
