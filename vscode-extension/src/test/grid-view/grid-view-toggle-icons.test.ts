import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';
import { createToggleState } from '../../grid-view/model/toggle-state';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * Inline toggle-icon placement.
 *
 * Invariants tested:
 *  - ⊟ (g-tm-on) lives in the leftmost gutter of the column-headers row
 *    of every tableMode:ON table.
 *  - ⇆ (g-flip) lives in the `.g-flip-corner` cell of every tableMode:ON
 *    table.
 *  - ⊞ (g-tm-off) is ALWAYS emitted on the top element row of every
 *    table-candidate run rendered as a tree ladder. Selection does not
 *    gate it. Non-candidate sections never emit it.
 */

// ── Fixture builders ──────────────────────────────────────────────

/** groupA = 3-item table-candidate run. Each item has attributes
 *  (`id`, `kind`) and children (name, value, meta). Attribute-first
 *  shape confirms the injector skips `r-attr` rows. */
function buildGroupAModel(): GridModel {
  const model = new GridModel();
  function item(idx: number, id: string, kind: string) {
    const nodeId = `/root[1]/groupA[1]/item[${idx}]`;
    return makeNodeData({
      nodeId,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 3,
      isHybridTableCandidate: true,
      childCount: 3,
      attributes: [
        { name: 'id', value: id },
        { name: 'kind', value: kind },
      ],
      children: [
        makeNodeData({ nodeId: `${nodeId}/name[1]`, name: 'name', value: `n${idx}` }),
        makeNodeData({ nodeId: `${nodeId}/value[1]`, name: 'value', value: `${idx}` }),
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
          nodeId: '/root[1]/groupA[1]',
          name: 'groupA',
          isTableCandidate: true,
          childCount: 3,
          children: [item(1, 'a1', 'alpha'), item(2, 'a2', 'beta'), item(3, 'a3', 'gamma')],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode('/root[1]/groupA[1]')!.isExpanded = true;
  model.findNode('/root[1]/groupA[1]/item[1]')!.isExpanded = true;
  return model;
}

/** Two disjoint table-candidate runs (groupA, groupB). */
function buildTwoGroupsModel(): GridModel {
  const model = new GridModel();
  function mkItem(group: string, idx: number) {
    const nodeId = `/root[1]/${group}[1]/item[${idx}]`;
    return makeNodeData({
      nodeId,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 2,
      isHybridTableCandidate: true,
      attributes: [{ name: 'id', value: `${group}-${idx}` }],
      children: [makeNodeData({ nodeId: `${nodeId}/v[1]`, name: 'v', value: 'x' })],
    });
  }
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      children: [
        makeNodeData({
          nodeId: '/root[1]/groupA[1]',
          name: 'groupA',
          isTableCandidate: true,
          children: [mkItem('groupA', 1), mkItem('groupA', 2)],
        }),
        makeNodeData({
          nodeId: '/root[1]/groupB[1]',
          name: 'groupB',
          isTableCandidate: true,
          children: [mkItem('groupB', 1), mkItem('groupB', 2)],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode('/root[1]/groupA[1]')!.isExpanded = true;
  model.findNode('/root[1]/groupB[1]')!.isExpanded = true;
  // Expand the first run member of each group so the tree-ladder has a
  // visible body row — the OFF icon targets the first attribute row of
  // that body, so at least one member must be expanded for the icon to
  // appear.
  model.findNode('/root[1]/groupA[1]/item[1]')!.isExpanded = true;
  model.findNode('/root[1]/groupB[1]/item[1]')!.isExpanded = true;
  return model;
}

/** Single-child section (not a run) — parent has exactly one element
 *  child, so `isTableCandidate` and `isHybridTableCandidate` are both
 *  false. No ⊞ must ever appear. */
function buildSingleChildModel(): GridModel {
  const model = new GridModel();
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      children: [
        makeNodeData({
          nodeId: '/root[1]/singleChild[1]',
          name: 'singleChild',
          children: [
            makeNodeData({
              nodeId: '/root[1]/singleChild[1]/only[1]',
              name: 'only',
              children: [
                makeNodeData({
                  nodeId: '/root[1]/singleChild[1]/only[1]/v[1]',
                  name: 'v',
                  value: '1',
                }),
              ],
            }),
          ],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode('/root[1]/singleChild[1]')!.isExpanded = true;
  return model;
}

/** Differing-shape siblings: two `item`s with different attribute sets.
 *  Not a table candidate. */
function buildDiffShapeModel(): GridModel {
  const model = new GridModel();
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      children: [
        makeNodeData({
          nodeId: '/root[1]/diffAttrs[1]',
          name: 'diffAttrs',
          children: [
            makeNodeData({
              nodeId: '/root[1]/diffAttrs[1]/item[1]',
              name: 'item',
              siblingIndex: 1,
              siblingCount: 2,
              attributes: [{ name: 'a', value: '1' }],
            }),
            makeNodeData({
              nodeId: '/root[1]/diffAttrs[1]/item[2]',
              name: 'item',
              siblingIndex: 2,
              siblingCount: 2,
              attributes: [{ name: 'b', value: '2' }],
            }),
          ],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode('/root[1]/diffAttrs[1]')!.isExpanded = true;
  return model;
}

/** Count occurrences of a literal substring in `s`. */
function count(s: string, needle: string): number {
  let n = 0;
  let i = 0;
  for (;;) {
    const at = s.indexOf(needle, i);
    if (at === -1) return n;
    n++;
    i = at + needle.length;
  }
}

/** Extract the full `<div class="g-row ...` row string that contains the
 *  given `needle`. Returns `undefined` if no row matches. */
function rowContaining(html: string, needle: string): string | undefined {
  const at = html.indexOf(needle);
  if (at === -1) return undefined;
  const start = html.lastIndexOf('<div class="g-row', at);
  if (start === -1) return undefined;
  const end = html.indexOf('</div>', at);
  if (end === -1) return undefined;
  return html.substring(start, end + '</div>'.length);
}

// ── Tests ─────────────────────────────────────────────────────────

suite('GridRenderer — inline toggle icons placed in chevron-bearing hybrid table cells', () => {
  test('tableMode-ON icon (g-tm-on) sits in column-headers row gutter of every tableMode:ON node', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildGroupAModel());
    assert.ok(html.includes('g-tm-on'), 'table-mode-ON icon must be emitted for tableMode:ON node');
    const headerIdx = html.indexOf('t-header');
    assert.ok(headerIdx !== -1, 't-header row exists');
    const tmOnIdx = html.indexOf('g-tm-on');
    assert.ok(tmOnIdx !== -1 && tmOnIdx > headerIdx, 'g-tm-on appears after t-header opens');
  });

  test('flip icon (g-flip) sits in .g-flip-corner cell of every tableMode:ON node', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildGroupAModel());
    assert.ok(html.includes('g-flip-corner'), 'flip corner cell present');
    const cornerRx = /g-flip-corner[^>]*>([^<]*<[^>]*g-flip[^>]*>)/;
    assert.ok(cornerRx.test(html), 'flip icon (g-flip) nested inside .g-flip-corner cell');
  });

  test('tableMode-OFF icon lands on the first body row of the first run member, not on the element header row', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    // Deliberately no setSelection — the icon must appear anyway.
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());
    assert.ok(
      html.includes('g-tm-off'),
      'OFF icon must be emitted on every table-candidate tree-ladder run',
    );
    assert.strictEqual(
      count(html, 'g-tm-off-gutter'),
      1,
      'exactly one OFF icon per tree-ladder run',
    );
    // The icon row must be an ATTRIBUTE row (data-node-type="attribute")
    // corresponding to item[1]'s first attribute — @id — because the
    // member's first body row is its first attribute row.
    const iconRow = rowContaining(html, 'g-tm-off-gutter');
    assert.ok(iconRow !== undefined, 'OFF icon is embedded in a row');
    assert.ok(
      iconRow!.includes('data-node-type="attribute"'),
      'OFF icon row must be the first body row (first attribute row of item[1])',
    );
    assert.ok(
      iconRow!.includes('data-node-id="/root[1]/groupA[1]/item[1]/@id"'),
      'OFF icon must land on item[1]/@id (first body row of the first run member)',
    );
    // The run-member header row itself must NOT carry the gutter icon.
    const headerRow = rowContaining(html, 'data-node-id="/root[1]/groupA[1]/item[1]"');
    assert.ok(headerRow !== undefined, 'item[1] header row is emitted');
    assert.ok(
      !headerRow!.includes('g-tm-off-gutter'),
      'item[1] element header row must NOT carry the ⊞ gutter',
    );
  });

  test('tableMode-OFF icon still appears when an empty selection model is attached', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    const emptySel = new GridSelectionModel();
    renderer.setToggleState(ts);
    renderer.setSelection(emptySel);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());
    assert.strictEqual(
      count(html, 'g-tm-off-gutter'),
      1,
      'selection is no longer a gate — empty selection must still show the icon',
    );
  });

  test('tableMode-OFF icon is absent when the run is rendered as a table (tableMode ON)', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    // tableMode left at default (ON) — groupA renders as a table.
    const html = renderer.render(buildGroupAModel());
    assert.ok(!html.includes('g-tm-off'), 'OFF icon must not appear on a run rendered as a table');
  });

  test('tableMode-OFF icon gutter sits one track to the right of the last ancestor-indent cell', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());
    // groupA sits at depth 1, its run members (item) are emitted at
    // childDepth = 2. The ⊞ gutter
    // sits at grid-column: childDepth+1 / childDepth+2 = 3 / 4 — the
    // SAME column the ⊟ icon would occupy in tableMode:ON — NOT at
    // the ancestor-indent column 2 / 3.
    const gutterRx = /g-tm-off-gutter[^>]*style="grid-column: 3 \/ 4;"/;
    assert.ok(gutterRx.test(html), 'OFF gutter at grid-column: 3 / 4 (childDepth+1)');
    const oldPlacementRx = /g-tm-off-gutter[^>]*style="grid-column: 2 \/ 3;"/;
    assert.ok(
      !oldPlacementRx.test(html),
      'OFF gutter must NOT land on the last ancestor-indent column (2 / 3)',
    );
  });

  test('OFF icon sits in same gutter column as the ON icon would occupy (regression for placement bug)', () => {
    // Render the SAME fixture in both modes; assert the OFF gutter
    // and the ON gutter resolve to identical `grid-column` starts,
    // which is the invariant the 2026-04-21 user report flagged.
    const on = new GridRenderer();
    const tsOn = createToggleState();
    on.setToggleState(tsOn);
    const htmlOn = on.render(buildGroupAModel());

    const off = new GridRenderer();
    const tsOff = createToggleState();
    off.setToggleState(tsOff);
    tsOff.setTableMode('/root[1]/groupA[1]', false);
    const htmlOff = off.render(buildGroupAModel());

    const onMatch = htmlOn.match(/g-tm-on-gutter[^>]*style="grid-column: (\d+) \/ (\d+);"/);
    const offMatch = htmlOff.match(/g-tm-off-gutter[^>]*style="grid-column: (\d+) \/ (\d+);"/);
    assert.ok(onMatch, 'ON gutter placement captured');
    assert.ok(offMatch, 'OFF gutter placement captured');
    assert.strictEqual(
      offMatch![1],
      onMatch![1],
      'OFF gutter start column must equal ON gutter start column',
    );
    assert.strictEqual(
      offMatch![2],
      onMatch![2],
      'OFF gutter end column must equal ON gutter end column',
    );
  });

  test('run-member element rows keep their default name-column placement (no name-cell shift)', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());
    // groupA childDepth = 2. Run-member element rows are emitted at
    // depth = childDepth = 2; their name cells therefore occupy the
    // default non-leaf placement `grid-column: 3 / -1` (d-2 name cell
    // spans from depth+1=3 all the way to the end track -1). The
    // icon sits on the first body row (the @id attribute row), NOT
    // on the element header, so name cells do NOT shift right.
    for (const idx of [1, 2, 3]) {
      const row = rowContaining(html, `data-node-id="/root[1]/groupA[1]/item[${idx}]"`);
      assert.ok(row, `item[${idx}] element row emitted`);
      assert.ok(
        row!.includes('class="g-cell c-name" style="grid-column: 3 / -1;"'),
        `item[${idx}] name cell keeps default placement at column 3 / -1`,
      );
      assert.ok(
        !row!.includes('g-tm-off-gutter'),
        `item[${idx}] element header row does NOT carry the gutter icon`,
      );
    }
  });

  test('two disjoint table-candidate runs each emit their own tree-ladder OFF icon', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    ts.setTableMode('/root[1]/groupB[1]', false);
    const html = renderer.render(buildTwoGroupsModel());
    assert.strictEqual(
      count(html, 'g-tm-off-gutter'),
      2,
      'two disjoint tree-ladder runs ⇒ two OFF icons',
    );
  });

  test('no OFF icon on a single-child section (non-candidate)', () => {
    const renderer = new GridRenderer();
    renderer.setToggleState(createToggleState());
    const html = renderer.render(buildSingleChildModel());
    assert.ok(!html.includes('g-tm-off'), 'single-child section must never emit ⊞');
  });

  test('no OFF icon on a differing-shape section (non-candidate)', () => {
    const renderer = new GridRenderer();
    renderer.setToggleState(createToggleState());
    const html = renderer.render(buildDiffShapeModel());
    assert.ok(!html.includes('g-tm-off'), 'differing-shape section must never emit ⊞');
  });

  test('parent section collapsed ⇒ no OFF icon painted', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const model = buildGroupAModel();
    // Collapse groupA — its run rows are not emitted.
    model.findNode('/root[1]/groupA[1]')!.isExpanded = false;
    const html = renderer.render(model);
    assert.ok(!html.includes('g-tm-off'), 'collapsed parent ⇒ no ⊞ painted');
  });

  test('icons carry role=button and data attributes used by the click delegator', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildGroupAModel());
    const onRx =
      /g-tm-on[^>]*data-toggle-target="\/root\[1\]\/groupA\[1\]"[^>]*data-action="toggle-table-mode"/;
    assert.ok(onRx.test(html), 'ON icon carries data-toggle-target + data-action');
    const flipRx =
      /g-flip[^>]*data-flip-target="\/root\[1\]\/groupA\[1\]"[^>]*data-action="toggle-flip"/;
    assert.ok(flipRx.test(html), 'flip icon carries data-flip-target + data-action');
    assert.ok(html.includes('role="button"'), 'icons carry role=button');
  });

  test('OFF icon in tree-ladder mode carries toggle-table-mode action keyed to the run parent', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());
    const offRx =
      /g-tm-off[^>]*data-toggle-target="\/root\[1\]\/groupA\[1\]"[^>]*data-action="toggle-table-mode"/;
    assert.ok(offRx.test(html), 'OFF icon click target is the run parent (groupA)');
  });

  test('legacy .r-toggle-strip row is no longer emitted anywhere', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildGroupAModel());
    assert.ok(!html.includes('r-toggle-strip'), 'r-toggle-strip row must not be emitted');
  });

  test('flipped tableMode:ON still carries both inline icons in the header row', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setFlipped('/root[1]/groupA[1]', true);
    const html = renderer.render(buildGroupAModel());
    assert.ok(html.includes('g-tm-on'), 'ON icon present in flipped header');
    assert.ok(html.includes('g-flip-corner'), 'flip corner cell present in flipped header');
  });

  test('icon gutter cell sits at grid-column: depth+1 of the column-headers row', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildGroupAModel());
    const gutterRx = /g-tm-on-gutter[^>]*style="grid-column: 3 \/ 4;"/;
    assert.ok(gutterRx.test(html), 'ON icon gutter at grid-column: 3 / 4 (depth+1)');
  });

  test('flip corner cell sits at grid-column: depth+2 (above the row-index column)', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildGroupAModel());
    const cornerRx = /g-flip-corner[^>]*style="grid-column: 4 \/ 5;"/;
    assert.ok(cornerRx.test(html), 'flip corner at grid-column: 4 / 5 (depth+2)');
  });
});
