import { strict as assert } from 'assert';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';
import {
  attrColumnId,
  elemColumnId,
  isColumnId,
  parseColumnId,
} from '../../grid-view/model/grid-selection-entry';
import {
  selectionAxisForCell,
} from '../../grid-view/model/grid-selection-axis';

/**
 * Axis-aware selection model with empty-on-open default.
 */

suite('GridSelectionModel — first-open empty selection (D0.1)', () => {
  test('first reconcile on a fresh model with empty selection stays empty (no fallback)', () => {
    const sel = new GridSelectionModel();
    sel.reconcile(['/a', '/b', '/c'], '/a');
    assert.strictEqual(sel.size, 0, 'row selection must remain empty on first open');
    assert.strictEqual(sel.anchor, null);
    assert.strictEqual(sel.activeCursor, null);
  });

  test('reconcile after the first takes the legacy fallback when everything drops', () => {
    const sel = new GridSelectionModel();
    // First reconcile primes the flag.
    sel.reconcile(['/a', '/b'], '/a');
    // User clicks to establish a real selection.
    sel.replaceWith('/b');
    assert.strictEqual(sel.size, 1);
    // Now a rebuild drops /b entirely — legacy Z5c fallback SHOULD kick in.
    sel.reconcile(['/x', '/y'], '/x');
    assert.strictEqual(sel.size, 1, 'fallback must apply on subsequent empty reconciles');
    assert.strictEqual(sel.activeCursor, '/x');
    assert.strictEqual(sel.anchor, '/x');
  });

  test('clear() puts the model back into fresh-open mode', () => {
    const sel = new GridSelectionModel();
    sel.replaceWith('/a');
    sel.clear();
    assert.strictEqual(sel.size, 0);
    assert.strictEqual(sel.anchor, null);
    assert.strictEqual(sel.activeCursor, null);
    // Post-clear: next empty reconcile must NOT apply the fallback.
    sel.reconcile(['/x'], '/x');
    assert.strictEqual(sel.size, 0, 'after clear(), next reconcile behaves like first-open');
  });

  test('any mutation flips the initial flag so subsequent empty reconcile applies fallback', () => {
    const sel = new GridSelectionModel();
    sel.toggle('/only');
    // /only gets dropped; fallback must kick in because toggle marked the
    // initial path complete.
    sel.reconcile(['/x'], '/x');
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.activeCursor, '/x');
  });

  test('fingerprint reconcile respects D0.1 on first call', () => {
    const sel = new GridSelectionModel();
    sel.reconcileWithFingerprints(['/a', '/b'], new Map(), null);
    assert.strictEqual(sel.size, 0, 'fingerprint path honours empty-on-open');
  });
});

suite('Grid selection — synthetic column id helpers', () => {
  test('attrColumnId / elemColumnId round-trip through parseColumnId', () => {
    const aid = attrColumnId('/root/groupA', 'id');
    const eid = elemColumnId('/root/groupA', 'name');
    assert.strictEqual(aid, '/root/groupA#col/@id');
    assert.strictEqual(eid, '/root/groupA#col/name');
    assert.deepStrictEqual(parseColumnId(aid), {
      parentNodeId: '/root/groupA',
      columnName: '@id',
    });
    assert.deepStrictEqual(parseColumnId(eid), {
      parentNodeId: '/root/groupA',
      columnName: 'name',
    });
  });

  test('isColumnId distinguishes synthetic column ids from plain nodeIds', () => {
    assert.strictEqual(isColumnId('/root/groupA#col/@id'), true);
    assert.strictEqual(isColumnId('/root/groupA/item[1]'), false);
    assert.strictEqual(isColumnId('/root/groupA/item[1]/@id'), false);
  });

  test('parseColumnId returns null for non-synthetic ids', () => {
    assert.strictEqual(parseColumnId('/root/groupA/item[1]'), null);
  });
});

suite('GridSelectionModel — column selection axis', () => {
  test('addColumn + hasColumn track synthetic column ids', () => {
    const sel = new GridSelectionModel();
    const cid = attrColumnId('/groupA', 'id');
    sel.addColumn(cid);
    assert.strictEqual(sel.hasColumn(cid), true);
    assert.strictEqual(sel.columnSize, 1);
  });

  test('removeColumn drops a column entry; columnSize decrements', () => {
    const sel = new GridSelectionModel();
    const cid = elemColumnId('/groupA', 'name');
    sel.addColumn(cid);
    sel.removeColumn(cid);
    assert.strictEqual(sel.hasColumn(cid), false);
    assert.strictEqual(sel.columnSize, 0);
  });

  test('toggleColumn flips presence', () => {
    const sel = new GridSelectionModel();
    const cid = elemColumnId('/groupA', 'value');
    sel.toggleColumn(cid);
    assert.strictEqual(sel.hasColumn(cid), true);
    sel.toggleColumn(cid);
    assert.strictEqual(sel.hasColumn(cid), false);
  });

  test('addColumn clears row state before adding (mutual exclusion I3)', () => {
    const sel = new GridSelectionModel('/row[1]');
    sel.addColumn(attrColumnId('/groupA', 'id'));
    assert.strictEqual(sel.size, 0, 'row set is cleared by addColumn');
    assert.strictEqual(sel.anchor, null);
    assert.strictEqual(sel.activeCursor, null);
    assert.strictEqual(sel.columnSize, 1);
  });

  test('row-adding mutator clears any pre-existing column selection', () => {
    const sel = new GridSelectionModel();
    sel.addColumn(elemColumnId('/groupA', 'name'));
    assert.strictEqual(sel.columnSize, 1);
    sel.toggle('/groupA/item[1]');
    assert.strictEqual(sel.hasRow('/groupA/item[1]'), true);
    assert.strictEqual(sel.hasColumn('/groupA#col/name'), false);
    assert.strictEqual(sel.size, 1);
    assert.strictEqual(sel.columnSize, 0);
  });

  test('toJSON includes columnIds array', () => {
    const sel = new GridSelectionModel();
    sel.addColumn(attrColumnId('/p', 'id'));
    sel.addColumn(elemColumnId('/p', 'name'));
    const snap = sel.toJSON();
    assert.ok(Array.isArray(snap.columnIds));
    assert.strictEqual(snap.columnIds?.length, 2);
  });
});

suite('GridSelectionModel — reconcile column entries by parent existence', () => {
  test('column entries survive reconcile when their parent is still rendered', () => {
    const sel = new GridSelectionModel();
    sel.addColumn(attrColumnId('/root/groupA', 'id'));
    sel.addColumn(elemColumnId('/root/groupA', 'name'));
    sel.reconcileColumns(new Set(['/root', '/root/groupA', '/root/groupA/item[1]']));
    assert.strictEqual(sel.columnSize, 2, 'both columns survive when parent exists');
  });

  test('column entries are dropped when their parent is deleted', () => {
    const sel = new GridSelectionModel();
    sel.addColumn(attrColumnId('/root/groupA', 'id'));
    sel.addColumn(elemColumnId('/root/groupB', 'name'));
    // groupA deleted; groupB still present.
    sel.reconcileColumns(new Set(['/root', '/root/groupB']));
    assert.strictEqual(sel.columnSize, 1);
    assert.strictEqual(sel.hasColumn('/root/groupA#col/@id'), false);
    assert.strictEqual(sel.hasColumn('/root/groupB#col/name'), true);
  });

  test('reconcileColumns with empty column set is a no-op', () => {
    const sel = new GridSelectionModel();
    sel.reconcileColumns(new Set(['/a']));
    assert.strictEqual(sel.columnSize, 0);
  });
});

suite('GridSelectionModel — row selection survives tableMode toggle', () => {
  test('row nodeIds are unchanged across a no-op reconcile (simulates tableMode flip)', () => {
    // tableMode is a renderer-side property: toggling it does not change
    // the set of RENDERABLE nodeIds (the same tree is emitted either as
    // a table or a tree ladder). The model therefore sees a reconcile
    // with the same existingIds, and the selection must survive
    // unchanged.
    const sel = new GridSelectionModel();
    sel.toggle('/groupA/item[1]');
    sel.toggle('/groupA/item[3]');
    const ids = ['/groupA', '/groupA/item[1]', '/groupA/item[2]', '/groupA/item[3]'];
    sel.reconcile(ids, '/groupA');
    assert.strictEqual(sel.size, 2);
    assert.ok(sel.hasRow('/groupA/item[1]'));
    assert.ok(sel.hasRow('/groupA/item[3]'));
    // Second reconcile (after another tableMode toggle) — still unchanged.
    sel.reconcile(ids, '/groupA');
    assert.strictEqual(sel.size, 2);
    assert.ok(sel.hasRow('/groupA/item[1]'));
    assert.ok(sel.hasRow('/groupA/item[3]'));
  });
});

suite('selectionAxisForCell — axis swap on flip', () => {
  const base = { rowId: '/groupA/item[1]', columnId: '/groupA#col/name' };

  test('unflipped + row selected → cell carries .selected', () => {
    assert.strictEqual(
      selectionAxisForCell({
        ...base, flipped: false, rowSelected: true, columnSelected: false,
      }),
      'selected',
    );
  });

  test('unflipped + column selected → cell carries .column-selected', () => {
    assert.strictEqual(
      selectionAxisForCell({
        ...base, flipped: false, rowSelected: false, columnSelected: true,
      }),
      'column-selected',
    );
  });

  test('flipped + row selected → axes swap: cell carries .column-selected', () => {
    // The original row is visually a COLUMN in flipped view — every
    // cell in that ORIGINAL row becomes a cell of the visual column.
    assert.strictEqual(
      selectionAxisForCell({
        ...base, flipped: true, rowSelected: true, columnSelected: false,
      }),
      'column-selected',
    );
  });

  test('flipped + column selected → axes swap: cell carries .selected', () => {
    // The original column is visually a ROW in flipped view — its
    // cells are cells of the visual row, which gets .selected.
    assert.strictEqual(
      selectionAxisForCell({
        ...base, flipped: true, rowSelected: false, columnSelected: true,
      }),
      'selected',
    );
  });

  test('nothing selected → none regardless of flip state', () => {
    for (const flipped of [false, true]) {
      assert.strictEqual(
        selectionAxisForCell({
          ...base, flipped, rowSelected: false, columnSelected: false,
        }),
        'none',
      );
    }
  });
});
