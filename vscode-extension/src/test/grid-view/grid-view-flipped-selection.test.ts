import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { GridSelectionSnapshot } from '../../grid-view/model/grid-selection';
import { createToggleState } from '../../grid-view/model/toggle-state';
import {
  attrColumnId,
  elemColumnId,
} from '../../grid-view/model/grid-selection-entry';
import {
  ControllerHost,
  GridMouseController,
  GridView,
} from '../../grid-view/scripts/mouse-bindings-controller';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * Selection behaviour on tableMode:ON regions, exercising the renderer
 * DOM contract AND the mouse controller axis-aware dispatch.
 *
 * Covers the four table-mode scenarios reported as regressed:
 *   - unflipped pure: click column header → column selection
 *   - unflipped hybrid: click column header → column selection
 *   - flipped pure: click visual row (wrapper) → column selection;
 *                   click visual column header (numeric cell) → row selection
 *   - flipped hybrid: same as flipped pure
 *
 * Shift+Click / Ctrl+Click modifiers, Escape clear, and mutual
 * exclusion between the row and column axes are also asserted. The
 * renderer-side tests verify the DOM attributes that the webview click
 * dispatch needs to resolve a click to the right axis; the controller-
 * side tests verify the axis-aware selection state transitions.
 */

const GROUP_PARENT = '/root[1]/groupA[1]';

// ---------- Fixture builders ----------

/** Build a pure scalar table region: each item has attributes + scalar
 *  element children, no chevron-bearing sub-elements. */
function buildScalarModel(): GridModel {
  const model = new GridModel();
  function item(idx: number): ReturnType<typeof makeNodeData> {
    const nodeId = `${GROUP_PARENT}/item[${idx}]`;
    return makeNodeData({
      nodeId,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 3,
      attributes: [{ name: 'id', value: `a${idx}` }],
      children: [
        makeNodeData({ nodeId: `${nodeId}/name[1]`, name: 'name', value: `N${idx}` }),
      ],
    });
  }
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      childCount: 1,
      children: [
        makeNodeData({
          nodeId: GROUP_PARENT,
          name: 'groupA',
          isTableCandidate: true,
          childCount: 3,
          children: [item(1), item(2), item(3)],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(GROUP_PARENT)!.isExpanded = true;
  // First member expanded so the group (#group) renders its table
  // region (shared-state semantics via seg.nodes[0].isExpanded).
  model.findNode(`${GROUP_PARENT}/item[1]`)!.isExpanded = true;
  return model;
}

/** Build a hybrid table region: each item has a chevron-bearing
 *  sub-element (`meta` with attributes). Matches the pattern used by
 *  `grid-view-flip-axis-highlight.test.ts` so the test fixture shape is
 *  consistent. */
function buildHybridModel(): GridModel {
  const model = new GridModel();
  function item(idx: number): ReturnType<typeof makeNodeData> {
    const nodeId = `${GROUP_PARENT}/item[${idx}]`;
    return makeNodeData({
      nodeId,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 3,
      isHybridTableCandidate: true,
      childCount: 2,
      attributes: [{ name: 'id', value: `a${idx}` }],
      children: [
        makeNodeData({ nodeId: `${nodeId}/name[1]`, name: 'name', value: `N${idx}` }),
        makeNodeData({
          nodeId: `${nodeId}/meta[1]`,
          name: 'meta',
          attributes: [{ name: 'owner', value: 'o' }],
        }),
      ],
    });
  }
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      childCount: 1,
      children: [
        makeNodeData({
          nodeId: GROUP_PARENT,
          name: 'groupA',
          isTableCandidate: true,
          childCount: 3,
          children: [item(1), item(2), item(3)],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(GROUP_PARENT)!.isExpanded = true;
  // First member expanded so data rows render (shared-state semantics).
  model.findNode(`${GROUP_PARENT}/item[1]`)!.isExpanded = true;
  return model;
}

// ---------- Renderer DOM contract ----------

suite('flipped-selection — renderer DOM contract for click dispatch', () => {
  test('unflipped pure table: t-th header cells carry data-column-id', () => {
    const renderer = new GridRenderer();
    renderer.setToggleState(createToggleState());
    const html = renderer.render(buildScalarModel());
    const attrCid = attrColumnId(GROUP_PARENT, 'id');
    const elemCid = elemColumnId(GROUP_PARENT, 'name');
    assert.ok(
      html.includes(`data-column-id="${attrCid}"`),
      `unflipped pure: attr column id present in header`,
    );
    assert.ok(
      html.includes(`data-column-id="${elemCid}"`),
      `unflipped pure: elem column id present in header`,
    );
    // No data-row-click-id in unflipped layout (row targets use the
    // full .g-row[data-node-id] wrapper instead).
    assert.ok(
      !html.includes('data-row-click-id='),
      'unflipped pure: no data-row-click-id attribute',
    );
  });

  test('unflipped hybrid table: t-th header cells carry data-column-id', () => {
    const renderer = new GridRenderer();
    renderer.setToggleState(createToggleState());
    const html = renderer.render(buildHybridModel());
    const attrCid = attrColumnId(GROUP_PARENT, 'id');
    const elemCid = elemColumnId(GROUP_PARENT, 'name');
    assert.ok(html.includes(`data-column-id="${attrCid}"`));
    assert.ok(html.includes(`data-column-id="${elemCid}"`));
    assert.ok(!html.includes('data-row-click-id='));
  });

  test('flipped pure table: each numeric header cell carries data-row-click-id for the underlying row', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    ts.setFlipped(GROUP_PARENT, true);
    renderer.setToggleState(ts);
    const html = renderer.render(buildScalarModel());
    for (const idx of [1, 2, 3]) {
      const rowId = `${GROUP_PARENT}/item[${idx}]`;
      assert.ok(
        html.includes(`data-row-click-id="${rowId}"`),
        `flipped pure: row-click-id for item[${idx}] present`,
      );
    }
  });

  test('flipped pure table: each data-row wrapper carries data-column-id', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    ts.setFlipped(GROUP_PARENT, true);
    renderer.setToggleState(ts);
    const html = renderer.render(buildScalarModel());
    const attrCid = attrColumnId(GROUP_PARENT, 'id');
    const elemCid = elemColumnId(GROUP_PARENT, 'name');
    // Each flipped data-row wrapper should have data-column-id on the
    // opening <div (alongside data-flip-col-name). We match the
    // wrapper tag by data-flip-col-name and assert data-column-id is
    // present in the same tag.
    const attrWrapperMatch = html.match(
      /<div class="g-row r-trow r-flipped[^"]*"[^>]*data-flip-col-name="id"[^>]*>/,
    );
    assert.ok(attrWrapperMatch, 'attr wrapper tag rendered');
    assert.ok(
      attrWrapperMatch![0].includes(`data-column-id="${attrCid}"`),
      `attr wrapper carries data-column-id: ${attrWrapperMatch![0]}`,
    );
    const elemWrapperMatch = html.match(
      /<div class="g-row r-trow r-flipped[^"]*"[^>]*data-flip-col-name="name"[^>]*>/,
    );
    assert.ok(elemWrapperMatch);
    assert.ok(
      elemWrapperMatch![0].includes(`data-column-id="${elemCid}"`),
      `elem wrapper carries data-column-id: ${elemWrapperMatch![0]}`,
    );
  });

  test('flipped hybrid table: numeric header cells carry data-row-click-id', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    ts.setFlipped(GROUP_PARENT, true);
    renderer.setToggleState(ts);
    const html = renderer.render(buildHybridModel());
    for (const idx of [1, 2, 3]) {
      const rowId = `${GROUP_PARENT}/item[${idx}]`;
      assert.ok(
        html.includes(`data-row-click-id="${rowId}"`),
        `flipped hybrid: row-click-id for item[${idx}] present`,
      );
    }
  });

  test('flipped hybrid table: each data-row wrapper carries data-column-id', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    ts.setFlipped(GROUP_PARENT, true);
    renderer.setToggleState(ts);
    const html = renderer.render(buildHybridModel());
    const attrCid = attrColumnId(GROUP_PARENT, 'id');
    const elemCid = elemColumnId(GROUP_PARENT, 'name');
    const attrWrapperMatch = html.match(
      /<div class="g-row r-trow r-flipped[^"]*"[^>]*data-flip-col-name="id"[^>]*>/,
    );
    assert.ok(attrWrapperMatch);
    assert.ok(attrWrapperMatch![0].includes(`data-column-id="${attrCid}"`));
    const elemWrapperMatch = html.match(
      /<div class="g-row r-trow r-flipped[^"]*"[^>]*data-flip-col-name="name"[^>]*>/,
    );
    assert.ok(elemWrapperMatch);
    assert.ok(elemWrapperMatch![0].includes(`data-column-id="${elemCid}"`));
  });
});

// ---------- Mouse controller axis dispatch ----------

class FakeView implements GridView {
  rowIds: string[] = [];
  lastSnap: GridSelectionSnapshot | null = null;
  getRowIds(): string[] {
    return this.rowIds;
  }
  isComment(): boolean {
    return false;
  }
  getNodeType(): string {
    return 'element';
  }
  getVisibleDescendantIds(): string[] {
    return [];
  }
  applySelection(snap: GridSelectionSnapshot): void {
    this.lastSnap = snap;
  }
}

class FakeHost implements ControllerHost {
  messages: Array<Record<string, unknown>> = [];
  postMessage(msg: unknown): void {
    this.messages.push(msg as Record<string, unknown>);
  }
}

function makeController(rowIds: string[]): {
  view: FakeView;
  host: FakeHost;
  controller: GridMouseController;
} {
  const view = new FakeView();
  view.rowIds = rowIds;
  const host = new FakeHost();
  return { view, host, controller: new GridMouseController(view, host) };
}

const R1 = `${GROUP_PARENT}/item[1]`;
const R2 = `${GROUP_PARENT}/item[2]`;
const R3 = `${GROUP_PARENT}/item[3]`;
const COL_ID = attrColumnId(GROUP_PARENT, 'id');
const COL_NAME = elemColumnId(GROUP_PARENT, 'name');
const ORDERED_COLS = [COL_ID, COL_NAME];

suite('flipped-selection — controller axis dispatch', () => {
  test('plain row click clears any prior column selection (mutual exclusion)', () => {
    const { controller } = makeController([R1, R2, R3]);
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    assert.deepEqual(controller.getSelection().toJSON().columnIds, [COL_ID]);
    controller.onRowClick(R2, { ctrl: false, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.nodeIds, [R2]);
    assert.deepEqual(snap.columnIds, [], 'columns cleared when switching to row axis');
  });

  test('plain column click clears any prior row selection (mutual exclusion)', () => {
    const { controller } = makeController([R1, R2, R3]);
    controller.onRowClick(R1, { ctrl: false, shift: false });
    assert.deepEqual(controller.getSelection().toJSON().nodeIds, [R1]);
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: false, shift: false });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, [COL_NAME]);
    assert.deepEqual(snap.nodeIds, [], 'rows cleared when switching to column axis');
  });

  test('Shift+Click extends a row range when the anchor is on the row axis', () => {
    const { controller } = makeController([R1, R2, R3]);
    controller.onRowClick(R1, { ctrl: false, shift: false });
    controller.onRowClick(R3, { ctrl: false, shift: true });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.nodeIds.sort(), [R1, R2, R3].sort());
    assert.equal(snap.activeCursor, R3);
  });

  test('Ctrl+Click toggles an individual row', () => {
    const { controller } = makeController([R1, R2, R3]);
    controller.onRowClick(R1, { ctrl: false, shift: false });
    controller.onRowClick(R2, { ctrl: true, shift: false });
    assert.deepEqual(controller.getSelection().toJSON().nodeIds.sort(), [R1, R2].sort());
    controller.onRowClick(R2, { ctrl: true, shift: false });
    assert.deepEqual(controller.getSelection().toJSON().nodeIds, [R1]);
  });

  test('Shift+Click extends a column range when the anchor is on the column axis', () => {
    const { controller } = makeController([R1, R2, R3]);
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: false, shift: true });
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds.sort(), [COL_ID, COL_NAME].sort());
    assert.equal(snap.columnActiveCursor, COL_NAME);
  });

  test('Ctrl+Click toggles an individual column', () => {
    const { controller } = makeController([R1, R2, R3]);
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: true, shift: false });
    assert.deepEqual(
      controller.getSelection().toJSON().columnIds.sort(),
      [COL_ID, COL_NAME].sort(),
    );
    controller.onColumnClick(COL_NAME, ORDERED_COLS, { ctrl: true, shift: false });
    assert.deepEqual(controller.getSelection().toJSON().columnIds, [COL_ID]);
  });

  test('clearSelection drops every axis (Escape semantics)', () => {
    const { controller } = makeController([R1, R2, R3]);
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.clearSelection();
    const snap = controller.getSelection().toJSON();
    assert.deepEqual(snap.columnIds, []);
    assert.deepEqual(snap.nodeIds, []);
    assert.equal(snap.columnAnchor, null);
    assert.equal(snap.activeCursor, null);
  });

  test('tree row click continues to work after a column-axis interaction (regression guard)', () => {
    const { controller, view } = makeController([R1, R2, R3]);
    controller.onColumnClick(COL_ID, ORDERED_COLS, { ctrl: false, shift: false });
    controller.onRowClick(R1, { ctrl: false, shift: false });
    assert.deepEqual(view.lastSnap?.nodeIds, [R1]);
    assert.equal(view.lastSnap?.activeCursor, R1);
    assert.deepEqual(view.lastSnap?.columnIds, []);
  });
});
