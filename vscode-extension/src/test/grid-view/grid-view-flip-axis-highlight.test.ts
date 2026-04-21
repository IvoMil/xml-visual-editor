import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { GridSelectionModel } from '../../grid-view/model/grid-selection';
import { createToggleState } from '../../grid-view/model/toggle-state';
import {
  elemColumnId,
} from '../../grid-view/model/grid-selection-entry';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * B.1.e / Q9 — axis-aware cell highlight at render time.
 *
 * Verifies that emit-table-region-hybrid (and its unflipped/flipped
 * branches) stamp `.selected` / `.column-selected` on `.t-cell` DOM at
 * emit time, using `selectionAxisForCell` via the
 * `resolveCellAxisClass` helper.
 *
 * Refs: docs/designs/DESIGN_GRID_ALIGNMENT.md §9.0 Q9.
 */

const GROUP_PARENT = '/root[1]/groupA[1]';

/** Build a hybrid groupA → item[1..3] run identical in shape to the
 *  other suites: two attributes (id, kind), three element children
 *  (name, value, meta). `meta` has attributes, making it a chevron-
 *  bearing column — hence the run renders in hybrid mode. */
function buildHybridModel(): GridModel {
  const model = new GridModel();
  function item(idx: number, id: string, kind: string, name: string, value: string): ReturnType<typeof makeNodeData> {
    const nodeId = `${GROUP_PARENT}/item[${idx}]`;
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
        makeNodeData({ nodeId: `${nodeId}/name[1]`, name: 'name', value: name }),
        makeNodeData({ nodeId: `${nodeId}/value[1]`, name: 'value', value }),
        makeNodeData({
          nodeId: `${nodeId}/meta[1]`,
          name: 'meta',
          attributes: [
            { name: 'owner', value: 'o' },
            { name: 'priority', value: 'p' },
          ],
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
          children: [
            item(1, 'a1', 'alpha', 'First', '11'),
            item(2, 'a2', 'beta', 'Second', '22'),
            item(3, 'a3', 'gamma', 'Third', '33'),
          ],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(GROUP_PARENT)!.isExpanded = true;
  // Table-region data rows render only when the first run member is
  // expanded (shared-state semantics via seg.nodes[0].isExpanded).
  model.findNode(`${GROUP_PARENT}/item[1]`)!.isExpanded = true;
  return model;
}

/** Extract the raw `class="..."` string from the first `.g-row` whose
 *  markup carries `data-node-id="${id}"`. Returns empty string when the
 *  row is not present. */
function classOfRowById(html: string, id: string): string {
  const needle = `data-node-id="${id}"`;
  const rowStart = html.lastIndexOf('<div class="', html.indexOf(needle));
  if (rowStart === -1) return '';
  const openStart = rowStart + '<div class="'.length;
  const openEnd = html.indexOf('"', openStart);
  return html.substring(openStart, openEnd);
}

/** Extract the flipped visual-row (`r-flipped` row) whose
 *  `data-flip-col-name` equals `colName`. Returns the row's entire
 *  opening tag including its class attribute. */
function flippedRowOpeningTag(html: string, colName: string): string {
  const needle = `data-flip-col-name="${colName}"`;
  const idx = html.indexOf(needle);
  if (idx === -1) return '';
  const tagStart = html.lastIndexOf('<div', idx);
  const tagEnd = html.indexOf('>', idx) + 1;
  return html.substring(tagStart, tagEnd);
}

/** Count `.t-cell` spans carrying the given axis class within the
 *  opening `<div class="g-row r-trow ...">...</div>` range starting at
 *  `rowAnchor` (any substring that uniquely identifies the wrapper).
 *  Uses exact class-token matching (split on whitespace) so that
 *  `selected` does NOT match inside `column-selected`. */
function cellsWithAxisInRow(
  html: string,
  rowAnchor: string,
  axisClass: 'selected' | 'column-selected',
): number {
  const anchorIdx = html.indexOf(rowAnchor);
  if (anchorIdx === -1) return 0;
  const tagOpen = html.lastIndexOf('<div', anchorIdx);
  const closingIdx = html.indexOf('</div>', anchorIdx);
  if (closingIdx === -1) return 0;
  const slice = html.substring(tagOpen, closingIdx);
  const spanRe = /<span class="(t-cell[^"]*)"/g;
  let count = 0;
  let m: RegExpExecArray | null = spanRe.exec(slice);
  while (m !== null) {
    const tokens = m[1].split(/\s+/);
    if (tokens.includes(axisClass)) count += 1;
    m = spanRe.exec(slice);
  }
  return count;
}

/** Count `.t-cell` spans anywhere in `html` that carry exactly
 *  `axisClass` as one of their class tokens. Exact-token matching so
 *  `selected` does NOT match inside `column-selected`. */
function allCellsWithAxis(
  html: string,
  axisClass: 'selected' | 'column-selected',
): number {
  const spanRe = /<span class="(t-cell[^"]*)"/g;
  let count = 0;
  let m: RegExpExecArray | null = spanRe.exec(html);
  while (m !== null) {
    const tokens = m[1].split(/\s+/);
    if (tokens.includes(axisClass)) count += 1;
    m = spanRe.exec(html);
  }
  return count;
}

/** Count `.t-cell` spans whose `grid-column` starts at the expected
 *  line for flipped original-row-index `origRowIdx` AND carry
 *  `axisClass` as an exact class token. Depth = 2 for the groupA run
 *  in `buildHybridModel` (root at depth 0, groupA at depth 1, table
 *  rows at depth 2, data cells start at grid-line `2+3+i` = `5+i`). */
function cellsInFlippedColumnWithAxis(
  html: string,
  origRowIdx: number,
  axisClass: 'selected' | 'column-selected',
): number {
  const depth = 2;
  const gcStart = depth + 3 + origRowIdx;
  const gcPrefix = `grid-column: ${gcStart} / ${gcStart + 1};`;
  // Span openings carry class="t-cell ..." followed by any number of
  // intervening attributes (data-flip-row-id etc.) and then a style.
  const spanRe = /<span class="(t-cell[^"]*)"[^>]*? style="([^"]+)"/g;
  let count = 0;
  let m: RegExpExecArray | null = spanRe.exec(html);
  while (m !== null) {
    const tokens = m[1].split(/\s+/);
    if (tokens.includes(axisClass) && m[2] === gcPrefix) count += 1;
    m = spanRe.exec(html);
  }
  return count;
}

suite('emit-table-region — axis-aware cell highlight stamps selected and column-selected on t-cell spans at render time', () => {
  test('H1. unflipped + row selected → item[1] cells carry .selected', () => {
    const renderer = new GridRenderer();
    const sel = new GridSelectionModel();
    sel.replaceWith(`${GROUP_PARENT}/item[1]`);
    renderer.setSelection(sel);

    const html = renderer.render(buildHybridModel());

    // Row wrapper carries .selected
    const cls = classOfRowById(html, `${GROUP_PARENT}/item[1]`);
    assert.match(cls, /\bselected\b/, `row wrapper class="${cls}"`);

    // Every data cell in item[1]'s row should have .selected. In the
    // hybrid model there are 5 data cells per row (id, kind, name,
    // value, meta-chevron). The rowidcell `.t-rowid` is NOT subject to
    // axis stamping, so we count t-cells with .selected, excluding
    // t-rowid.
    const anchor = `data-node-id="${GROUP_PARENT}/item[1]"`;
    const selCount = cellsWithAxisInRow(html, anchor, 'selected');
    // 5 data cells + 1 rowid cell; rowid is not stamped, so 5 selected
    // data cells. Row wrapper itself also matches `\bselected\b` inside
    // the `<div class="...">` prefix but cellsWithAxisInRow matches only
    // `<span class="t-cell...`.
    assert.strictEqual(selCount, 5, 'item[1] has 5 .selected data cells');

    // item[2] row has NO .selected cells.
    const other = `data-node-id="${GROUP_PARENT}/item[2]"`;
    assert.strictEqual(cellsWithAxisInRow(html, other, 'selected'), 0);
    // Nor any .column-selected cells in unflipped row-selection mode.
    assert.strictEqual(cellsWithAxisInRow(html, anchor, 'column-selected'), 0);
  });

  test('H2. unflipped + column "name" selected → all name cells carry .column-selected', () => {
    const renderer = new GridRenderer();
    const sel = new GridSelectionModel();
    sel.addColumn(elemColumnId(GROUP_PARENT, 'name'));
    renderer.setSelection(sel);

    const html = renderer.render(buildHybridModel());

    // Each of the three data rows has exactly ONE .column-selected cell
    // (the `name` column).
    for (const idx of [1, 2, 3]) {
      const anchor = `data-node-id="${GROUP_PARENT}/item[${idx}]"`;
      assert.strictEqual(
        cellsWithAxisInRow(html, anchor, 'column-selected'), 1,
        `item[${idx}] has exactly one .column-selected cell`,
      );
      // And NO .selected cells (no row is row-selected).
      assert.strictEqual(
        cellsWithAxisInRow(html, anchor, 'selected'), 0,
        `item[${idx}] has no .selected cells`,
      );
    }
  });

  test('H3. flipped + row item[1] selected → item[1]\'s column (visual) carries .column-selected', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    ts.setFlipped(GROUP_PARENT, true);
    renderer.setToggleState(ts);

    const sel = new GridSelectionModel();
    sel.replaceWith(`${GROUP_PARENT}/item[1]`);
    renderer.setSelection(sel);

    const html = renderer.render(buildHybridModel());

    // In flipped view, item[1]'s original row is now a visual column at
    // origRowIdx=0. Five data rows (id, kind, name, value, meta), each
    // contributing one cell into that visual column → 5 .column-selected.
    const colSel = cellsInFlippedColumnWithAxis(html, 0, 'column-selected');
    assert.strictEqual(colSel, 5, '5 .column-selected cells in item[1] column');

    // No .selected data cells when only a row is selected in flipped view.
    assert.strictEqual(
      allCellsWithAxis(html, 'selected'), 0,
      'no .selected cells in flipped row-selection mode',
    );
  });

  test('H4. flipped + column "name" selected → the "name" visual row carries .selected', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    ts.setFlipped(GROUP_PARENT, true);
    renderer.setToggleState(ts);

    const sel = new GridSelectionModel();
    sel.addColumn(elemColumnId(GROUP_PARENT, 'name'));
    renderer.setSelection(sel);

    const html = renderer.render(buildHybridModel());

    // Wrapper for the "name" visual row carries .selected.
    const wrapperTag = flippedRowOpeningTag(html, 'name');
    assert.match(wrapperTag, /class="[^"]*\bselected\b/, `wrapper tag: ${wrapperTag}`);

    // Each of the three data cells in the "name" visual row carries
    // .selected.
    const selCount = cellsWithAxisInRow(
      html, 'data-flip-col-name="name"', 'selected',
    );
    assert.strictEqual(selCount, 3, '3 .selected data cells in "name" visual row');
  });

  test('H5. round-trip: flip → flip back returns highlight to original axis', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);

    const sel = new GridSelectionModel();
    sel.replaceWith(`${GROUP_PARENT}/item[1]`);
    renderer.setSelection(sel);

    // Unflipped baseline.
    const base = renderer.render(buildHybridModel());
    const baseSel = cellsWithAxisInRow(
      base, `data-node-id="${GROUP_PARENT}/item[1]"`, 'selected',
    );
    assert.strictEqual(baseSel, 5, 'baseline: 5 .selected data cells');

    // Flip.
    ts.setFlipped(GROUP_PARENT, true);
    const flipped = renderer.render(buildHybridModel());
    assert.strictEqual(
      cellsInFlippedColumnWithAxis(flipped, 0, 'column-selected'), 5,
      'flipped: 5 .column-selected cells in item[1] visual column',
    );
    // And NO .selected data cells (wrapper for the "id" / "name" etc.
    // rows may match `\bselected\b` inside `data-node-id` substrings,
    // so we restrict to t-cell spans).
    assert.strictEqual(
      allCellsWithAxis(flipped, 'selected'), 0,
      'flipped: no .selected data cells',
    );

    // Flip back → axis returns to row.
    ts.setFlipped(GROUP_PARENT, false);
    const roundTrip = renderer.render(buildHybridModel());
    const rtSel = cellsWithAxisInRow(
      roundTrip, `data-node-id="${GROUP_PARENT}/item[1]"`, 'selected',
    );
    assert.strictEqual(rtSel, 5, 'round-trip: back to 5 .selected data cells');
    assert.strictEqual(
      allCellsWithAxis(roundTrip, 'column-selected'), 0,
      'round-trip: no .column-selected cells after flip-back',
    );
  });
});
