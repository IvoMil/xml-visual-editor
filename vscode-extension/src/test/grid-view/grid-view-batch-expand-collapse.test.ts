import { strict as assert } from 'assert';
import {
  GridMouseController,
  GridView,
  ControllerHost,
} from '../../grid-view/scripts/mouse-bindings-controller';
import { GridSelectionSnapshot } from '../../grid-view/model/grid-selection';

/**
 * Batch `+` / `-` expand/collapse over the multi-select set.
 *
 * The canonical controller owns a pure helper (`batchToggleExpand`) that
 * returns the ids whose expansion state would flip under direction-guarded
 * semantics. The webview glue forwards those ids to the host, which
 * owns `GridNode.isExpanded` and performs a single atomic re-render.
 *
 * These tests drive the controller method directly plus a FakeHost that
 * simulates the host loop, so selection integrity + atomicity can be
 * verified end-to-end without a real webview.
 *
 * Locked decisions exercised here (DESIGN_GRID_MULTI_SELECT):
 *   - Comment rows are no-ops for `+`/`-`.
 *   - Direction-guarded — `+` only expands collapsed, `-` only
 *     collapses expanded; already-in-target-state is untouched.
 *   - Operates on every id regardless of DOM visibility (hidden
 *     descendants still flip).
 */

interface FakeRowSpec {
  id: string;
  isComment?: boolean;
  hasChildren?: boolean;
  isExpanded?: boolean;
}

interface FakeRow {
  id: string;
  isComment: boolean;
  nodeType: string;
  selected: boolean;
  cursor: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
}

class FakeView implements GridView {
  rows: FakeRow[] = [];

  setRows(specs: FakeRowSpec[]): void {
    this.rows = specs.map((r) => ({
      id: r.id,
      isComment: r.isComment ?? false,
      nodeType: r.isComment ? 'comment' : 'element',
      selected: false,
      cursor: false,
      hasChildren: r.hasChildren ?? false,
      isExpanded: r.isExpanded ?? false,
    }));
  }

  findRow(id: string): FakeRow | undefined {
    return this.rows.find((r) => r.id === id);
  }

  selectedIds(): string[] {
    return this.rows.filter((r) => r.selected).map((r) => r.id);
  }

  cursorId(): string | null {
    const r = this.rows.find((row) => row.cursor);
    return r ? r.id : null;
  }

  getRowIds(): string[] {
    return this.rows.map((r) => r.id);
  }

  isComment(nodeId: string): boolean {
    return this.findRow(nodeId)?.isComment ?? false;
  }

  getNodeType(nodeId: string): string {
    return this.findRow(nodeId)?.nodeType ?? 'element';
  }

  applySelection(snap: GridSelectionSnapshot): void {
    const selSet = new Set(snap.nodeIds);
    for (const r of this.rows) {
      r.selected = selSet.has(r.id);
      r.cursor = r.id === snap.activeCursor;
    }
  }

  // ---- Predicates used by batchToggleExpand ----
  isExpandedPredicate = (id: string): boolean => this.findRow(id)?.isExpanded ?? false;
  hasChildrenPredicate = (id: string): boolean => this.findRow(id)?.hasChildren ?? false;
}

class FakeHost implements ControllerHost {
  messages: Array<Record<string, unknown>> = [];
  postMessage(msg: unknown): void {
    this.messages.push(msg as Record<string, unknown>);
  }
  countOfType(type: string): number {
    return this.messages.filter((m) => m.type === type).length;
  }
}

/** Mirror of the host-side loop in grid-view-panel.ts: given the list of
 *  ids that the controller said would change, flip the fake expansion
 *  state on the view. Returns the number of rows flipped. */
function simulateHostApply(view: FakeView, changedIds: string[]): number {
  for (const id of changedIds) {
    const row = view.findRow(id);
    if (row) {
      row.isExpanded = !row.isExpanded;
    }
  }
  return changedIds.length;
}

suite('GridMouseController — batch +/- expand/collapse over multi-select', () => {
  let view: FakeView;
  let host: FakeHost;
  let ctrl: GridMouseController;

  setup(() => {
    view = new FakeView();
    host = new FakeHost();
    ctrl = new GridMouseController(view, host);
  });

  test('1. + on single-row selection of collapsed expandable node → that node flips', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false },
      { id: 'B', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    host.messages.length = 0;
    const changed = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed, ['A']);
    assert.equal(ctrl.getSelection().size, 1);
    assert.equal(ctrl.getSelection().activeCursor, 'A');
  });

  test('2. + on single-row selection of already-expanded node → no-op', () => {
    view.setRows([{ id: 'A', hasChildren: true, isExpanded: true }]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    const changed = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed, []);
  });

  test('3. + on single-row selection of a leaf → no-op', () => {
    view.setRows([{ id: 'A', hasChildren: false }]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    const changed = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed, []);
  });

  test('4. + on 3 collapsed expandable nodes → all 3 flip; selection set unchanged', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false },
      { id: 'B', hasChildren: true, isExpanded: false },
      { id: 'C', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.extendRangeTo('C', ['A', 'B', 'C']);
    host.messages.length = 0;
    const changed = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed.sort(), ['A', 'B', 'C']);
    // Selection integrity
    const snap = ctrl.getSelection().toJSON();
    assert.deepEqual(snap.nodeIds.slice().sort(), ['A', 'B', 'C']);
    assert.equal(snap.anchor, 'A');
    assert.equal(snap.activeCursor, 'C');
  });

  test('5. + on mixed selection (collapsed / expanded / leaf) → only collapsed flips', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false }, // collapsed
      { id: 'B', hasChildren: true, isExpanded: true }, // already expanded
      { id: 'C', hasChildren: false }, // leaf
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.onRowClick('B', { ctrl: true, shift: false });
    ctrl.onRowClick('C', { ctrl: true, shift: false });
    const changed = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed, ['A']);
    // Selection untouched by batchToggleExpand itself
    assert.equal(ctrl.getSelection().size, 3);
  });

  test('6. - on 3 expanded nodes → all 3 flip; selection unchanged', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: true },
      { id: 'B', hasChildren: true, isExpanded: true },
      { id: 'C', hasChildren: true, isExpanded: true },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.extendRangeTo('C', ['A', 'B', 'C']);
    const changed = ctrl.batchToggleExpand(
      '-',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed.sort(), ['A', 'B', 'C']);
    assert.equal(ctrl.getSelection().size, 3);
    assert.equal(ctrl.getSelection().anchor, 'A');
    assert.equal(ctrl.getSelection().activeCursor, 'C');
  });

  test('7. - on mixed selection (expanded / collapsed / comment) → only expanded flips', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: true },
      { id: 'B', hasChildren: true, isExpanded: false },
      { id: 'C', isComment: true },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.onRowClick('B', { ctrl: true, shift: false });
    ctrl.onRowClick('C', { ctrl: true, shift: false });
    const changed = ctrl.batchToggleExpand(
      '-',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed, ['A']);
  });

  test('8. + on a comment row in the selection is skipped; sibling expandable flips', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false },
      { id: 'CMT', isComment: true },
      { id: 'B', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.extendRangeTo('B', ['A', 'CMT', 'B']);
    assert.ok(ctrl.getSelection().has('CMT'));
    const changed = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed.sort(), ['A', 'B']);
    assert.ok(!changed.includes('CMT'));
  });

  test('9. + on a hidden descendant still flips state silently', () => {
    // Row list deliberately does NOT include H (hidden under its parent).
    // The selection still carries H; since FakeView treats it as
    // non-comment with hasChildren=true + collapsed, the predicates
    // (which the real host wires to engine state) still resolve it.
    view.setRows([
      { id: 'P', hasChildren: true, isExpanded: false },
      { id: 'Q', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    ctrl.onRowClick('Q', { ctrl: true, shift: false });
    // Inject a hidden id into the selection by toggling an id the view
    // does not enumerate in getRowIds.
    ctrl.onRowClick('H', { ctrl: true, shift: false });
    // Predicates are the host's source of truth: answer for H
    // as if it existed in the engine tree.
    const isExpanded = (id: string): boolean => {
      if (id === 'H') return false;
      return view.isExpandedPredicate(id);
    };
    const hasChildren = (id: string): boolean => {
      if (id === 'H') return true;
      return view.hasChildrenPredicate(id);
    };
    const changed = ctrl.batchToggleExpand('+', isExpanded, hasChildren);
    assert.ok(changed.includes('H'), 'hidden descendant still flips');
    assert.deepEqual(changed.slice().sort(), ['H', 'P', 'Q']);
  });

  test('10. + then - round-trips to the original expansion state', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false },
      { id: 'B', hasChildren: true, isExpanded: false },
      { id: 'C', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.extendRangeTo('C', ['A', 'B', 'C']);

    // +: expand all three
    const changedPlus = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    simulateHostApply(view, changedPlus);
    assert.ok(view.findRow('A')!.isExpanded);
    assert.ok(view.findRow('B')!.isExpanded);
    assert.ok(view.findRow('C')!.isExpanded);

    // -: collapse all three
    const changedMinus = ctrl.batchToggleExpand(
      '-',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    simulateHostApply(view, changedMinus);
    assert.equal(view.findRow('A')!.isExpanded, false);
    assert.equal(view.findRow('B')!.isExpanded, false);
    assert.equal(view.findRow('C')!.isExpanded, false);
  });

  test('11. Selection set integrity: anchor, activeCursor, size preserved across +/-', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false },
      { id: 'B', hasChildren: true, isExpanded: false },
      { id: 'C', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.extendRangeTo('C', ['A', 'B', 'C']);

    const before = ctrl.getSelection().toJSON();
    ctrl.batchToggleExpand('+', view.isExpandedPredicate, view.hasChildrenPredicate);
    const afterPlus = ctrl.getSelection().toJSON();
    assert.deepEqual(afterPlus.nodeIds.slice().sort(), before.nodeIds.slice().sort());
    assert.equal(afterPlus.anchor, before.anchor);
    assert.equal(afterPlus.activeCursor, before.activeCursor);

    ctrl.batchToggleExpand('-', view.isExpandedPredicate, view.hasChildrenPredicate);
    const afterMinus = ctrl.getSelection().toJSON();
    assert.deepEqual(afterMinus.nodeIds.slice().sort(), before.nodeIds.slice().sort());
    assert.equal(afterMinus.anchor, before.anchor);
    assert.equal(afterMinus.activeCursor, before.activeCursor);
  });

  test('12. Atomicity: batchToggleExpand posts no selectionChanged messages', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false },
      { id: 'B', hasChildren: true, isExpanded: false },
      { id: 'C', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.extendRangeTo('C', ['A', 'B', 'C']);
    host.messages.length = 0;

    ctrl.batchToggleExpand('+', view.isExpandedPredicate, view.hasChildrenPredicate);
    ctrl.batchToggleExpand('-', view.isExpandedPredicate, view.hasChildrenPredicate);

    // Neither call mutates the selection, and the helper is pure — it
    // must never broadcast selectionChanged on its own.
    assert.equal(host.countOfType('selectionChanged'), 0);
  });

  test('13. Legacy single-cursor + behaviour matches batch with size=1 (regression anchor)', () => {
    view.setRows([{ id: 'A', hasChildren: true, isExpanded: false }]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    assert.equal(ctrl.getSelection().size, 1);
    const changed = ctrl.batchToggleExpand(
      '+',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    // With size=1 the webview actually takes the legacy single-node
    // path; this test confirms that the controller helper, if called,
    // returns a semantically identical single-id list.
    assert.deepEqual(changed, ['A']);
  });

  test('14. - on collapsed-only selection → empty changed list (no-op)', () => {
    view.setRows([
      { id: 'A', hasChildren: true, isExpanded: false },
      { id: 'B', hasChildren: true, isExpanded: false },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.extendRangeTo('B', ['A', 'B']);
    const changed = ctrl.batchToggleExpand(
      '-',
      view.isExpandedPredicate,
      view.hasChildrenPredicate,
    );
    assert.deepEqual(changed, []);
  });
});

/**
 * Selection growth on `+`: expanded nodes grow the selection to include
 * newly-revealed direct children.
 *
 * After a batch `+` expands selected nodes, the newly-revealed direct
 * children join the selection set so a second `+` drills another level.
 * Anchor and activeCursor are preserved across every growth step.
 *
 * The webview pre-computes which selected ids are currently collapsed
 * (the "growth parents") BEFORE posting batchToggleExpand. After the
 * host's updateTreeData reply re-renders the DOM, the webview walks
 * each parent's direct children from the new DOM and calls
 * controller.growSelection(ids). These tests cover that final step
 * directly via `growSelection` since the upstream pre-compute is a
 * pure DOM walk covered by the table-row helper tests.
 */
suite('GridSelectionModel + GridMouseController — selection grows to include descendants when expanded node is in the selection', () => {
  let view: FakeView;
  let host: FakeHost;
  let ctrl: GridMouseController;

  setup(() => {
    view = new FakeView();
    host = new FakeHost();
    ctrl = new GridMouseController(view, host);
  });

  test('X1. Single selected row, expand → newly-revealed children join the selection', () => {
    view.setRows([
      { id: 'P', hasChildren: true, isExpanded: false },
      { id: 'P/c1' },
      { id: 'P/c2' },
    ]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    ctrl.growSelection(['P/c1', 'P/c2']);
    const snap = ctrl.getSelection().toJSON();
    assert.deepEqual(snap.nodeIds.slice().sort(), ['P', 'P/c1', 'P/c2']);
    assert.equal(snap.anchor, 'P');
    assert.equal(snap.activeCursor, 'P');
  });

  test('X2. Two selected rows, both expanded → BOTH sets of children joined', () => {
    view.setRows([
      { id: 'P', hasChildren: true },
      { id: 'Q', hasChildren: true },
    ]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    ctrl.onRowClick('Q', { ctrl: true, shift: false });
    ctrl.growSelection(['P/c1', 'Q/c1', 'Q/c2']);
    const snap = ctrl.getSelection().toJSON();
    assert.deepEqual(snap.nodeIds.slice().sort(), ['P', 'P/c1', 'Q', 'Q/c1', 'Q/c2']);
    assert.equal(snap.anchor, 'P');
    assert.equal(snap.activeCursor, 'Q');
  });

  test('X3. Already-expanded row contributes no growth (caller filters)', () => {
    /* The webview pre-compute (pickGrowthParents) excludes parents
     * whose chevron shows data-expanded="true". Here we simulate that
     * by passing an empty grow-list — the selection must stay as-is. */
    view.setRows([{ id: 'P', hasChildren: true, isExpanded: true }]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    const before = ctrl.getSelection().toJSON();
    ctrl.growSelection([]);
    const after = ctrl.getSelection().toJSON();
    assert.deepEqual(after.nodeIds, before.nodeIds);
    assert.equal(after.anchor, before.anchor);
    assert.equal(after.activeCursor, before.activeCursor);
  });

  test('X4. After growth, second `+` grows further (drill-down)', () => {
    view.setRows([{ id: 'P' }, { id: 'P/c1' }, { id: 'P/c1/g1' }]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    ctrl.growSelection(['P/c1']);
    ctrl.growSelection(['P/c1/g1']);
    const snap = ctrl.getSelection().toJSON();
    assert.deepEqual(snap.nodeIds.slice().sort(), ['P', 'P/c1', 'P/c1/g1']);
    assert.equal(snap.anchor, 'P');
    assert.equal(snap.activeCursor, 'P');
  });

  test('X5. `-` produces no growth; ids in the model stay', () => {
    /* The handler skips growSelection on `-`. Confirm: model size
     * unchanged after a no-op grow call. Hidden ids still in set. */
    view.setRows([{ id: 'P' }, { id: 'P/c1' }]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    ctrl.onRowClick('P/c1', { ctrl: true, shift: false });
    const before = ctrl.getSelection().toJSON();
    ctrl.growSelection([]); // direction `-` produces no parents → empty
    const after = ctrl.getSelection().toJSON();
    assert.deepEqual(after.nodeIds.slice().sort(), before.nodeIds.slice().sort());
  });

  test('X6. Anchor and activeCursor preserved across multiple growth iterations', () => {
    view.setRows([
      { id: 'A' },
      { id: 'B' },
      { id: 'C' },
    ]);
    ctrl.onRowClick('A', { ctrl: false, shift: false });
    ctrl.onRowClick('C', { ctrl: true, shift: false });
    const before = ctrl.getSelection().toJSON();
    ctrl.growSelection(['A/x', 'C/y']);
    ctrl.growSelection(['A/x/y']);
    ctrl.growSelection(['C/y/z', 'C/y/w']);
    const after = ctrl.getSelection().toJSON();
    assert.equal(after.anchor, before.anchor);
    assert.equal(after.activeCursor, before.activeCursor);
    assert.equal(after.nodeIds.length, before.nodeIds.length + 5);
  });

  test('X7. growSelection broadcasts selectionChanged exactly once', () => {
    view.setRows([{ id: 'P' }, { id: 'P/c1' }]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    host.messages.length = 0;
    ctrl.growSelection(['P/c1']);
    assert.equal(host.countOfType('selectionChanged'), 1);
  });

  test('X8. growSelection with empty array is a no-op (no broadcast)', () => {
    view.setRows([{ id: 'P' }]);
    ctrl.onRowClick('P', { ctrl: false, shift: false });
    host.messages.length = 0;
    ctrl.growSelection([]);
    assert.equal(host.messages.length, 0);
  });
});
