import { strict as assert } from 'assert';
import {
  pickInnermostExpanded,
  RowDepthEntry,
} from '../../grid-view/scripts/batch-expand-helpers';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { GridTreeNodeData } from '../../grid-view/grid-view-types';

/**
 * Z14 (round-4 re-fix, 2026-04-20) — real-DOM-shaped test for
 * `pickInnermostExpanded`. Uses the actual GridRenderer output and
 * parses it with a regex mirror of the webview's
 * `__buildOrderedRowDepthIndex` / `__isRowElExpanded` / `__collectCellChevronsJS`
 * functions so the algorithm is exercised against the ACTUAL DOM shape
 * instead of hand-crafted fixtures.
 *
 * The previously-shipped Z14 unit tests used hand-crafted fixtures that
 * matched the renderer's INTENDED output but not the USER-observed
 * DOM. These tests close the loop: if the renderer changes its output
 * shape, this suite catches the regression in the picker.
 */

function makeNodeData(overrides: Partial<GridTreeNodeData> = {}): GridTreeNodeData {
  return {
    nodeId: '/root[1]',
    name: 'root',
    type: 'element',
    value: '',
    line: 0,
    column: 0,
    childCount: 0,
    isTableCandidate: false,
    siblingIndex: 1,
    siblingCount: 1,
    attributes: [],
    children: [],
    ...overrides,
  };
}

/** Regex-parse the renderer HTML into the same RowDepthEntry[] shape
 *  the inline JS walker produces. Only rows carrying `data-node-id`
 *  are emitted, matching `.g-row[data-node-id]`. Naive `.*?` matching
 *  breaks on cells with nested `<div class="cell-nv">…</div>` blocks
 *  (cell-expanded elements), so we slice between successive `<div
 *  class="g-row ` tokens instead and reach the row's closing `</div>`
 *  by counting depth. */
function parseRowsFromHtml(html: string): RowDepthEntry[] {
  const out: RowDepthEntry[] = [];
  const token = '<div class="g-row ';
  const starts: number[] = [];
  for (let i = 0; (i = html.indexOf(token, i)) !== -1; i++) starts.push(i);

  for (let si = 0; si < starts.length; si++) {
    const start = starts[si];
    // Walk a balanced div pair from start.
    let depth = 0;
    let cursor = start;
    let end = -1;
    while (cursor < html.length) {
      const openIdx = html.indexOf('<div', cursor);
      const closeIdx = html.indexOf('</div>', cursor);
      if (closeIdx === -1) break;
      if (openIdx !== -1 && openIdx < closeIdx) {
        depth++;
        cursor = openIdx + 4;
      } else {
        depth--;
        cursor = closeIdx + 6;
        if (depth === 0) { end = cursor; break; }
      }
    }
    if (end === -1) continue;

    const block = html.slice(start, end);
    const idMatch = /data-node-id="([^"]+)"/.exec(block);
    if (!idMatch) continue;
    const depthMatch = /data-depth="(\d+)"/.exec(block);
    if (!depthMatch) continue;
    const classMatch = /^<div class="g-row ([^"]+)"/.exec(block);
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];

    const id = idMatch[1];
    const d = parseInt(depthMatch[1], 10);
    const isTableRow = classes.includes('r-trow') && !classes.includes('t-header');

    // `isExpanded` — any `.expand-toggle` with data-expanded="true"
    // anywhere inside the row, matching webview `__isRowElExpanded`.
    const anyToggleExpanded =
      /<span[^>]*class="[^"]*\bexpand-toggle\b[^"]*"[^>]*data-expanded="true"/.test(block);

    const cellChevrons: Array<{ childId: string; isExpanded: boolean }> = [];
    const cellRegex =
      /<span[^>]*class="[^"]*\bexpand-toggle\s+cell-toggle\b[^"]*"[^>]*data-node-id="([^"]+)"[^>]*data-expanded="(true|false)"/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(block)) !== null) {
      cellChevrons.push({ childId: cm[1], isExpanded: cm[2] === 'true' });
    }

    out.push({
      id,
      depth: d,
      isExpanded: anyToggleExpanded,
      isTableRow,
      cellChevrons: isTableRow ? cellChevrons : undefined,
    });
  }
  return out;
}

/** Build `<root><groupA>…</groupA></root>` where groupA is a table of
 *  N `<item>` children, each with one `<meta>` element child that has
 *  attributes (so meta is cell-expandable). Exactly ONE item's meta
 *  is pre-expanded — simulating the user's real screenshot. */
function buildUserReproModel(options: {
  itemCount: number;
  metaExpandedOnItem: number; // 1-based index
}): GridModel {
  const items: GridTreeNodeData[] = [];
  for (let i = 1; i <= options.itemCount; i++) {
    const meta = makeNodeData({
      nodeId: `/root[1]/groupA[1]/item[${i}]/meta[1]`,
      name: 'meta',
      attributes: [
        { name: 'owner', value: i === 2 ? 'bob' : 'alice' },
        { name: 'priority', value: 'low' },
      ],
    });
    items.push(
      makeNodeData({
        nodeId: `/root[1]/groupA[1]/item[${i}]`,
        name: 'item',
        siblingCount: options.itemCount,
        siblingIndex: i,
        children: [meta],
      }),
    );
  }
  const groupA = makeNodeData({
    nodeId: '/root[1]/groupA[1]',
    name: 'groupA',
    isTableCandidate: true,
    childCount: options.itemCount,
    children: items,
  });
  const root = makeNodeData({ name: 'root', children: [groupA] });
  const model = new GridModel();
  model.setTreeData(root, 3);
  // Test explicitly opts into the legacy `expandDepth = 3` path so root
  // + groupA start expanded, preserving the Z14-class real-DOM scenario
  // this fixture exercises. (Production `setTreeData` uses the D0
  // collapsed-by-default path — GridNode default `expandDepth = 0`.)
  // Items are table-candidate children so they start collapsed; the
  // table region renders iff seg.nodes[0].isExpanded. Expand item[1]
  // so the #group row flips open and the .r-trow rows render.
  model.findNode('/root[1]/groupA[1]/item[1]')!.toggleExpanded();
  if (options.metaExpandedOnItem >= 1) {
    const meta = model.findNode(
      `/root[1]/groupA[1]/item[${options.metaExpandedOnItem}]/meta[1]`,
    );
    if (meta) meta.toggleExpanded();
  }
  return model;
}

suite('pickInnermostExpanded — verified against real GridRenderer DOM output to catch picker / renderer shape mismatches', () => {
  test('user repro: #group selected, row 2 has cell-expanded <meta> → pick returns meta, NOT #group', () => {
    const model = buildUserReproModel({ itemCount: 3, metaExpandedOnItem: 2 });
    const renderer = new GridRenderer();
    const html = renderer.render(model);
    const rows = parseRowsFromHtml(html);

    // Sanity: the #group label row must be present.
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    const groupRow = rows.find((r) => r.id === groupId);
    assert.ok(groupRow, `#group row missing in rendered HTML; got ids: ${rows.map((r) => r.id).join(', ')}`);
    assert.equal(groupRow!.isExpanded, true, '#group must be expanded in user repro');

    // Sanity: the expanded meta chevron must be detected on item[2].
    const item2 = rows.find((r) => r.id === '/root[1]/groupA[1]/item[2]');
    assert.ok(item2, 'item[2] r-trow row missing');
    assert.equal(item2!.isTableRow, true);
    assert.ok(
      item2!.cellChevrons && item2!.cellChevrons.some((c) => c.isExpanded),
      'item[2] must have an expanded cell-toggle for <meta>',
    );

    // The picker should return the meta child id, NOT the #group root.
    const picked = pickInnermostExpanded(rows, [groupId]);
    assert.deepEqual(
      picked,
      ['/root[1]/groupA[1]/item[2]/meta[1]'],
      `Z14 picker must return the cell-expanded meta. Got: ${JSON.stringify(picked)}. ` +
        `DOM rows: ${JSON.stringify(
          rows.map((r) => ({ id: r.id, depth: r.depth, exp: r.isExpanded, tr: r.isTableRow })),
        )}`,
    );
  });

  test('user repro: #group selected, NO inner cell expanded → pick returns #group itself', () => {
    const model = buildUserReproModel({ itemCount: 3, metaExpandedOnItem: -1 });
    const renderer = new GridRenderer();
    const html = renderer.render(model);
    const rows = parseRowsFromHtml(html);
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    assert.deepEqual(pickInnermostExpanded(rows, [groupId]), [groupId]);
  });

  test('user repro: real-DOM depth layout — #group and .r-trow share the same data-depth', () => {
    const model = buildUserReproModel({ itemCount: 3, metaExpandedOnItem: 2 });
    const html = new GridRenderer().render(model);
    const rows = parseRowsFromHtml(html);
    const groupId = '/root[1]/groupA[1]/item[1]#group';
    const group = rows.find((r) => r.id === groupId)!;
    const item1 = rows.find((r) => r.id === '/root[1]/groupA[1]/item[1]')!;
    const item2 = rows.find((r) => r.id === '/root[1]/groupA[1]/item[2]')!;
    const item3 = rows.find((r) => r.id === '/root[1]/groupA[1]/item[3]')!;
    assert.equal(group.depth, item1.depth, '#group and r-trow must share data-depth');
    assert.equal(item1.depth, item2.depth);
    assert.equal(item2.depth, item3.depth);
  });
});
