import { strict as assert } from 'assert';
import {
  GridMouseController,
  GridView,
  ControllerHost,
} from '../../grid-view/scripts/mouse-bindings-controller';
import { GridSelectionSnapshot } from '../../grid-view/model/grid-selection';

/** Fake DOM adapter: maintains an ordered list of rows with `.selected` /
 *  `.cursor` class state, exposes helpers mirroring the webview DOM. */
interface FakeRow {
  id: string;
  isComment: boolean;
  nodeType: string;
  selected: boolean;
  cursor: boolean;
}

class FakeView implements GridView {
  rows: FakeRow[] = [];
  messages: unknown[] = [];
  // Per-node descendant lists the fake walk returns.
  // Tests set this up to simulate the DOM-based descendant walk from
  // the webview-js twin (ordinary expanded headers, synthesized
  // `#group` headers, etc.). Nodes without an entry yield [] (i.e.
  // "no visible descendants" — leaves / collapsed / standalone).
  descendants: Map<string, string[]> = new Map();
  expanded: Set<string> = new Set();

  // ControllerHost adapter methods combined in one helper below
  setRows(rows: Array<{ id: string; isComment?: boolean; nodeType?: string }>): void {
    this.rows = rows.map((r) => ({
      id: r.id,
      isComment: r.isComment ?? false,
      nodeType: r.nodeType ?? 'element',
      selected: false,
      cursor: false,
    }));
  }

  setDescendants(nodeId: string, ids: string[]): void {
    this.descendants.set(nodeId, ids);
  }

  setExpanded(nodeId: string, expanded: boolean): void {
    if (expanded) this.expanded.add(nodeId);
    else this.expanded.delete(nodeId);
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
    return this.rows.find((r) => r.id === nodeId)?.isComment ?? false;
  }

  getNodeType(nodeId: string): string {
    return this.rows.find((r) => r.id === nodeId)?.nodeType ?? 'element';
  }

  isRowExpanded(nodeId: string): boolean {
    return this.expanded.has(nodeId);
  }

  getVisibleDescendantIds(nodeId: string): string[] {
    return this.descendants.get(nodeId) ?? [];
  }

  applySelection(snap: GridSelectionSnapshot): void {
    const selSet = new Set(snap.nodeIds);
    for (const r of this.rows) {
      r.selected = selSet.has(r.id);
      r.cursor = r.id === snap.activeCursor;
    }
  }
}

class FakeHost implements ControllerHost {
  messages: Array<Record<string, unknown>> = [];
  postMessage(msg: unknown): void {
    this.messages.push(msg as Record<string, unknown>);
  }
  lastOfType(type: string): Record<string, unknown> | undefined {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === type) return this.messages[i];
    }
    return undefined;
  }
}

function makeRows(ids: string[]): Array<{ id: string }> {
  return ids.map((id) => ({ id }));
}

suite('GridMouseController — mouse bindings', () => {
  let view: FakeView;
  let host: FakeHost;
  let controller: GridMouseController;

  setup(() => {
    view = new FakeView();
    host = new FakeHost();
    controller = new GridMouseController(view, host);
    view.setRows(makeRows(['R1', 'R2', 'R3', 'R4']));
  });

  test('plain click on R1 selects only R1 with cursor on R1', () => {
    controller.onRowClick('R1', { ctrl: false, shift: false });
    assert.deepEqual(view.selectedIds(), ['R1']);
    assert.equal(view.cursorId(), 'R1');
  });

  test('plain click R1 then R2 replaces selection with R2', () => {
    controller.onRowClick('R1', { ctrl: false, shift: false });
    controller.onRowClick('R2', { ctrl: false, shift: false });
    assert.deepEqual(view.selectedIds(), ['R2']);
    assert.equal(view.cursorId(), 'R2');
  });

  test('Ctrl+Click across three rows selects all three; cursor on last', () => {
    controller.onRowClick('R1', { ctrl: true, shift: false });
    controller.onRowClick('R2', { ctrl: true, shift: false });
    controller.onRowClick('R3', { ctrl: true, shift: false });
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3']);
    assert.equal(view.cursorId(), 'R3');
  });

  test('Ctrl+Click on already selected row toggles it off', () => {
    controller.onRowClick('R1', { ctrl: true, shift: false });
    controller.onRowClick('R2', { ctrl: true, shift: false });
    controller.onRowClick('R3', { ctrl: true, shift: false });
    // Remove R2 (not the cursor): R2 drops, cursor stays on R3.
    controller.onRowClick('R2', { ctrl: true, shift: false });
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R3']);
    assert.equal(view.cursorId(), 'R3');

    // Remove R3 (the cursor): cursor falls back to anchor R1.
    controller.onRowClick('R3', { ctrl: true, shift: false });
    assert.deepEqual(view.selectedIds(), ['R1']);
    assert.equal(view.cursorId(), 'R1');
  });

  test('Shift+Click extends forward: R1 anchor, Shift+Click R4 covers R1..R4', () => {
    controller.onRowClick('R1', { ctrl: false, shift: false });
    controller.onRowClick('R4', { ctrl: false, shift: true });
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3', 'R4']);
    assert.equal(view.cursorId(), 'R4');
    assert.equal(controller.getSelection().anchor, 'R1');
  });

  test('Shift+Click extends backward: R4 anchor, Shift+Click R1 covers R1..R4', () => {
    controller.onRowClick('R4', { ctrl: false, shift: false });
    controller.onRowClick('R1', { ctrl: false, shift: true });
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3', 'R4']);
    assert.equal(view.cursorId(), 'R1');
    assert.equal(controller.getSelection().anchor, 'R4');
  });

  test('Shift+Click range INCLUDES a comment row', () => {
    view.setRows([
      { id: 'R1' },
      { id: 'R2' },
      { id: 'R3', isComment: true, nodeType: 'comment' },
      { id: 'R4' },
    ]);
    controller.onRowClick('R1', { ctrl: false, shift: false });
    controller.onRowClick('R4', { ctrl: false, shift: true });
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2', 'R3', 'R4']);
  });

  test('plain click on comment row selects it', () => {
    view.setRows([
      { id: 'R1' },
      { id: 'R2', isComment: true, nodeType: 'comment' },
      { id: 'R3' },
    ]);
    controller.onRowClick('R1', { ctrl: false, shift: false });
    const changed = controller.onRowClick('R2', { ctrl: false, shift: false });
    assert.equal(changed, true);
    assert.deepEqual(view.selectedIds(), ['R2']);
    assert.equal(view.cursorId(), 'R2');
  });

  test('Ctrl+Click on comment row DOES toggle it', () => {
    view.setRows([
      { id: 'R1' },
      { id: 'R2', isComment: true, nodeType: 'comment' },
      { id: 'R3' },
    ]);
    controller.onRowClick('R1', { ctrl: false, shift: false });
    controller.onRowClick('R2', { ctrl: true, shift: false });
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R2']);
  });

  test('reconcile drops a missing id and preserves the surviving cursor/anchor', () => {
    controller.onRowClick('R1', { ctrl: true, shift: false });
    controller.onRowClick('R2', { ctrl: true, shift: false });
    controller.onRowClick('R3', { ctrl: true, shift: false });
    // Simulate re-render that removes R2.
    view.setRows(makeRows(['R1', 'R3', 'R4']));
    controller.reconcile(['R1', 'R3', 'R4'], 'R1');
    assert.deepEqual(view.selectedIds().sort(), ['R1', 'R3']);
    assert.equal(view.cursorId(), 'R3');
    assert.equal(controller.getSelection().anchor, 'R1');
  });

  test('reconcile drops the cursor, anchor survives → cursor falls back to anchor', () => {
    controller.onRowClick('R1', { ctrl: true, shift: false }); // anchor=R1
    controller.onRowClick('R3', { ctrl: true, shift: false }); // cursor=R3
    view.setRows(makeRows(['R1', 'R2', 'R4']));
    controller.reconcile(['R1', 'R2', 'R4'], 'R1');
    assert.equal(controller.getSelection().activeCursor, 'R1');
    assert.equal(controller.getSelection().anchor, 'R1');
    assert.deepEqual(view.selectedIds(), ['R1']);
  });

  test('selectionChanged message broadcast on mutation', () => {
    controller.onRowClick('R1', { ctrl: false, shift: false });
    const m = host.lastOfType('selectionChanged');
    assert.ok(m, 'expected selectionChanged message');
    assert.deepEqual((m!.selection as GridSelectionSnapshot).nodeIds, ['R1']);
    assert.equal((m!.selection as GridSelectionSnapshot).activeCursor, 'R1');
    assert.equal(m!.activeNodeType, 'element');
  });

  test('plain click on comment emits selectionChanged + nodeSelected with comment type', () => {
    view.setRows([
      { id: 'R1' },
      { id: 'R2', isComment: true, nodeType: 'comment' },
    ]);
    controller.onRowClick('R2', { ctrl: false, shift: false });
    const sel = host.lastOfType('selectionChanged');
    assert.ok(sel, 'expected selectionChanged message');
    assert.equal(sel!.activeNodeType, 'comment');
    const ns = host.lastOfType('nodeSelected');
    assert.ok(ns, 'expected nodeSelected message');
    assert.equal(ns!.nodeId, 'R2');
    assert.equal(ns!.nodeType, 'comment');
  });
});

suite('GridMouseController — Ctrl+click auto-grows expanded header and plain click on #group auto-selects its table rows', () => {
  let view: FakeView;
  let host: FakeHost;
  let controller: GridMouseController;

  setup(() => {
    view = new FakeView();
    host = new FakeHost();
    controller = new GridMouseController(view, host);
  });

  // ---- Ctrl+click on expanded header auto-grows selection ----

  test('Ctrl+click on expanded header auto-adds visible descendants to the selection', () => {
    view.setRows(makeRows(['X', 'A', 'A/c1', 'A/c2']));
    view.setExpanded('A', true);
    view.setDescendants('A', ['A/c1', 'A/c2']);
    // Pre-select an unrelated row so the Ctrl+click is a union-add (not
    // a first-click empty-selection special case).
    controller.onRowClick('X', { ctrl: false, shift: false });
    controller.onRowClick('A', { ctrl: true, shift: false });
    assert.deepEqual(
      view.selectedIds().sort(),
      ['A', 'A/c1', 'A/c2', 'X'],
    );
    assert.equal(view.cursorId(), 'A');
    assert.equal(controller.getSelection().anchor, 'X');
  });

  test('Ctrl+click again on same selected expanded header deselects the header and its auto-added descendants', () => {
    view.setRows(makeRows(['X', 'A', 'A/c1', 'A/c2']));
    view.setExpanded('A', true);
    view.setDescendants('A', ['A/c1', 'A/c2']);
    controller.onRowClick('X', { ctrl: false, shift: false });
    controller.onRowClick('A', { ctrl: true, shift: false }); // adds A + c1 + c2
    // Second Ctrl+click on same expanded header must remove the whole subtree.
    controller.onRowClick('A', { ctrl: true, shift: false });
    assert.deepEqual(view.selectedIds(), ['X']);
    assert.equal(view.cursorId(), 'X');
    assert.equal(controller.getSelection().anchor, 'X');
  });

  test('Ctrl+click on collapsed header selects only that single row without attempting a descendant walk', () => {
    view.setRows(makeRows(['X', 'A']));
    view.setExpanded('A', false);
    // Collapsed → descendant walk returns []. (FakeView default.)
    controller.onRowClick('X', { ctrl: false, shift: false });
    controller.onRowClick('A', { ctrl: true, shift: false });
    assert.deepEqual(view.selectedIds().sort(), ['A', 'X']);
    assert.equal(view.cursorId(), 'A');
  });

  test('Ctrl+click on leaf row selects only that single row', () => {
    view.setRows(makeRows(['X', 'leaf']));
    // No descendants configured for 'leaf' → [].
    controller.onRowClick('X', { ctrl: false, shift: false });
    controller.onRowClick('leaf', { ctrl: true, shift: false });
    assert.deepEqual(view.selectedIds().sort(), ['X', 'leaf']);
    assert.equal(view.cursorId(), 'leaf');
  });

  // ---- plain click on synthesized `#group` header auto-grows ----

  test('plain click on #group header auto-selects all visible .r-trow table row ids', () => {
    // Simulate: groupA contains <item>, which opens a nested table. The
    // `#group` header is at the same data-depth as its .r-trow rows —
    // the DOM-based walk in the twin handles this; here we mock the
    // descendants list the view returns.
    view.setRows(makeRows([
      '/root/groupA/item[1]#group',
      '/root/groupA/item[1]/row[1]',
      '/root/groupA/item[1]/row[2]',
      '/root/groupA/item[1]/row[3]',
    ]));
    // isRowExpanded on a #group header historically returned false — the
    // new trigger ignores it and relies on the descendant walk only.
    view.setExpanded('/root/groupA/item[1]#group', false);
    view.setDescendants('/root/groupA/item[1]#group', [
      '/root/groupA/item[1]/row[1]',
      '/root/groupA/item[1]/row[2]',
      '/root/groupA/item[1]/row[3]',
    ]);
    controller.onRowClick('/root/groupA/item[1]#group', { ctrl: false, shift: false });
    assert.deepEqual(view.selectedIds().sort(), [
      '/root/groupA/item[1]#group',
      '/root/groupA/item[1]/row[1]',
      '/root/groupA/item[1]/row[2]',
      '/root/groupA/item[1]/row[3]',
    ]);
    assert.equal(view.cursorId(), '/root/groupA/item[1]#group');
  });

  test('plain click on a collapsed #group header selects only the header row itself', () => {
    view.setRows(makeRows(['/root/g#group', 'other']));
    // Collapsed: descendants list is empty.
    view.setDescendants('/root/g#group', []);
    controller.onRowClick('/root/g#group', { ctrl: false, shift: false });
    assert.deepEqual(view.selectedIds(), ['/root/g#group']);
    assert.equal(view.cursorId(), '/root/g#group');
  });

  test('plain click on an ordinary expanded element still auto-grows to include its visible descendants', () => {
    view.setRows(makeRows(['H', 'H/a', 'H/b']));
    // With the DOM-based trigger, isRowExpanded is no longer consulted —
    // but it MUST still auto-grow for ordinary headers (walk returns
    // children at depth+1).
    view.setDescendants('H', ['H/a', 'H/b']);
    controller.onRowClick('H', { ctrl: false, shift: false });
    assert.deepEqual(view.selectedIds().sort(), ['H', 'H/a', 'H/b']);
    assert.equal(view.cursorId(), 'H');
    assert.equal(controller.getSelection().anchor, 'H');
  });
});
