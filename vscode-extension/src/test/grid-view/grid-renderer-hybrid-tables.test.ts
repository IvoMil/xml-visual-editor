import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { isHybridRun } from '../../grid-view/view/emit-table-region-hybrid';
import { makeNodeData } from './grid-renderer.test-helpers';
import { GridNode } from '../../grid-view/model/grid-node';

/**
 * B.1.c — Hybrid table rendering with chevron-bearing cells.
 *
 * Engine-side B.1.a marks same-shape repeated runs with
 * `isHybridTableCandidate`. The webview renders such runs as a hybrid
 * table: scalar columns stay as plain text; chevron-bearing columns
 * render a `.cell-toggle` chevron. When a row's chevron cell is
 * expanded, the renderer injects a full-width `.r-trow-nested` row
 * immediately below the data row with the child's subtree.
 *
 * See docs/designs/DESIGN_GRID_ALIGNMENT.md §9.0 Q1/Q2/Q6.
 */
suite('GridRenderer — hybrid table rendering with chevron-bearing cells', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  /** Fixture: groupA from resources/sample_files/grid_expand_collaps_select.xml.
   *  Three `<item>` rows each with attributes `id`, `kind`, scalar children
   *  `<name>` + `<value>`, and a chevron-bearing `<meta owner priority/>`. */
  function makeGroupAItem(
    idx: number,
    attrs: { id: string; kind: string },
    scalar: { name: string; value: string },
    meta: { owner: string; priority: string },
  ) {
    const parent = `/root[1]/groupA[1]`;
    const itemId = `${parent}/item[${idx}]`;
    return makeNodeData({
      nodeId: itemId,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 3,
      isHybridTableCandidate: true,
      childCount: 3,
      attributes: [
        { name: 'id', value: attrs.id },
        { name: 'kind', value: attrs.kind },
      ],
      children: [
        makeNodeData({
          nodeId: `${itemId}/name[1]`,
          name: 'name',
          value: scalar.name,
          siblingIndex: 1,
          siblingCount: 1,
        }),
        makeNodeData({
          nodeId: `${itemId}/value[1]`,
          name: 'value',
          value: scalar.value,
          siblingIndex: 1,
          siblingCount: 1,
        }),
        makeNodeData({
          nodeId: `${itemId}/meta[1]`,
          name: 'meta',
          siblingIndex: 1,
          siblingCount: 1,
          attributes: [
            { name: 'owner', value: meta.owner },
            { name: 'priority', value: meta.priority },
          ],
        }),
      ],
    });
  }

  function buildGroupAModel(): GridModel {
    const model = new GridModel();
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
            children: [
              makeGroupAItem(
                1,
                { id: 'a1', kind: 'alpha' },
                { name: 'First A item', value: '11' },
                { owner: 'ivo', priority: 'high' },
              ),
              makeGroupAItem(
                2,
                { id: 'a2', kind: 'beta' },
                { name: 'Second A item', value: '22' },
                { owner: 'bob', priority: 'low' },
              ),
              makeGroupAItem(
                3,
                { id: 'a3', kind: 'gamma' },
                { name: 'Third A item', value: '33' },
                { owner: 'sue', priority: 'medium' },
              ),
            ],
          }),
        ],
      }),
      3,
    );
    // Expand root, then expand the first item so the #group header opens.
    model.findNode('/root[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupA[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupA[1]/item[1]')!.isExpanded = true;
    return model;
  }

  // ── 1. isHybridRun helper ──────────────────────────────────────────────

  test('H1. isHybridRun returns true when any member has isHybridTableCandidate=true', () => {
    const data = makeNodeData({
      isHybridTableCandidate: true,
      nodeId: '/r/x[1]',
      name: 'x',
    });
    const node = new GridNode(data, 0);
    assert.strictEqual(isHybridRun([node]), true);
  });

  test('H2. isHybridRun returns false for a pure-scalar run with no flag', () => {
    const scalar = new GridNode(
      makeNodeData({
        nodeId: '/r/x[1]',
        name: 'x',
        value: '1',
      }),
      0,
    );
    assert.strictEqual(isHybridRun([scalar]), false);
  });

  test('H3. isHybridRun falls back to shape check when child has sub-elements', () => {
    const data = makeNodeData({
      nodeId: '/r/x[1]',
      name: 'x',
      children: [
        makeNodeData({
          nodeId: '/r/x[1]/sub[1]',
          name: 'sub',
          children: [
            makeNodeData({ nodeId: '/r/x[1]/sub[1]/leaf[1]', name: 'leaf', value: 'v' }),
          ],
        }),
      ],
    });
    const node = new GridNode(data, 2);
    assert.strictEqual(isHybridRun([node]), true);
  });

  // ── 2. Hybrid cell rendering ──────────────────────────────────────────

  test('H4. hybrid run emits one .r-trow per member with attr + scalar-elem + chevron cells', () => {
    const html = renderer.render(buildGroupAModel());
    // 1 header + 3 data rows
    const dataRowMatches = html.match(/class="g-row r-trow d-/g) ?? [];
    assert.strictEqual(
      dataRowMatches.length,
      3,
      `expected 3 r-trow data rows, got ${dataRowMatches.length}`,
    );
    // Attr column headers for id and kind
    assert.ok(html.includes('= id'), 'attr header "= id"');
    assert.ok(html.includes('= kind'), 'attr header "= kind"');
    // Elem column headers for name, value, meta
    assert.ok(html.includes('&lt;&gt; name'), 'elem header for name');
    assert.ok(html.includes('&lt;&gt; value'), 'elem header for value');
    assert.ok(html.includes('&lt;&gt; meta'), 'elem header for meta');
    // Attr + scalar values appear
    assert.ok(html.includes('a1') && html.includes('alpha'));
    assert.ok(html.includes('First A item') && html.includes('11'));
  });

  test('H5. chevron-bearing cell has .expand-toggle.cell-toggle with data-node-id on child', () => {
    const html = renderer.render(buildGroupAModel());
    const m = html.match(
      /expand-toggle cell-toggle[^>]*data-node-id="([^"]+)"[^>]*data-expanded="(true|false)"/,
    );
    assert.ok(m, 'chevron cell must have cell-toggle data-node-id + data-expanded');
    assert.ok(m[1].endsWith('/meta[1]'), 'chevron keyed on meta child nodeId');
    assert.ok(html.includes('t-cell-hybrid'), 'chevron cell uses t-cell-hybrid class');
  });

  test('H6. collapsed chevron cell shows ▶ and "…" (not a (N) count for singleton)', () => {
    const html = renderer.render(buildGroupAModel());
    const idx = html.indexOf('t-cell-hybrid');
    assert.ok(idx !== -1);
    const area = html.substring(idx, idx + 400);
    assert.ok(area.includes('\u25b6'), 'collapsed chevron ▶');
    assert.ok(area.includes('\u2026'), 'ellipsis summary for singleton child');
  });

  // ── 3. Drill-box wrapper (chevron drill-down) ──────────────────────

  test('H7. expanding chevron child emits a .g-drill-box wrapper immediately after its parent r-trow', () => {
    const model = buildGroupAModel();
    model.findNode('/root[1]/groupA[1]/item[2]/meta[1]')!.isExpanded = true;
    const html = renderer.render(model);
    const rowIdx = html.indexOf('data-node-id="/root[1]/groupA[1]/item[2]"');
    assert.ok(rowIdx !== -1, 'item[2] row must exist');
    const rowEnd = html.indexOf('</div>', rowIdx);
    const tail = html.substring(rowEnd + '</div>'.length, rowEnd + 400);
    assert.ok(
      tail.startsWith('<div class="g-drill-box"'),
      `drill-box wrapper must be the immediate DOM sibling after the parent r-trow; got: ${tail.substring(0, 160)}`,
    );
  });

  test('H8. drill-box wrapper carries data-parent-row-id and a bounded grid-column', () => {
    const model = buildGroupAModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const html = renderer.render(model);
    const m = html.match(
      /<div class="g-drill-box"[^>]*data-parent-row-id="([^"]+)"[^>]*style="([^"]+)"/,
    );
    assert.ok(m, 'drill-box wrapper with data-parent-row-id + style');
    assert.strictEqual(m![1], '/root[1]/groupA[1]/item[1]', 'parent row id points to the data row');
    // Wrapper column must be bounded — not the former full-width `1 / -1` span.
    assert.ok(
      /grid-column:\s*\d+\s*\/\s*\d+/.test(m![2]),
      `drill-box wrapper must carry a finite grid-column; got: ${m![2]}`,
    );
    assert.ok(!/\/\s*-1/.test(m![2]), 'drill-box wrapper must NOT stretch to -1');
  });

  test('H9. drill-box wrapper contains the expanded host attribute rows (rendered at drill-box local depth 0)', () => {
    const model = buildGroupAModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const html = renderer.render(model);
    // Attribute rows inside the drill-box render at local depth 0
    // because the drill-box owns its own grid template.
    const ownerIdx = html.indexOf('data-node-id="/root[1]/groupA[1]/item[1]/meta[1]/@owner"');
    assert.notStrictEqual(ownerIdx, -1, 'owner attr row emitted inside drill-box');
    const rowOpen = html.substring(html.lastIndexOf('<div', ownerIdx), html.indexOf('>', ownerIdx) + 1);
    assert.ok(
      /data-depth="0"/.test(rowOpen),
      `owner attr row inside a drill-box must carry data-depth="0"; got: ${rowOpen}`,
    );
    // And it sits INSIDE the drill-box wrapper (not outside).
    const boxIdx = html.indexOf('<div class="g-drill-box"');
    const boxEnd = html.indexOf('</div></div>', boxIdx);
    assert.ok(boxIdx >= 0 && ownerIdx > boxIdx && ownerIdx < boxEnd + 10,
      'owner attr must be inside the drill-box wrapper');
  });

  test('H10. collapsed chevron cell does NOT emit a drill-down item', () => {
    const html = renderer.render(buildGroupAModel());
    // All meta cells collapsed by default — no drill-down rows anywhere.
    assert.ok(
      !html.includes('r-trow-drill'),
      'no r-trow-drill should be emitted when every chevron cell is collapsed',
    );
  });

  // ── 4. Pure-scalar regression guard ──────────────────────────────────

  test('H11. pure-scalar run WITHOUT hybrid flag stays on legacy path (no cell-toggle)', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        nodeId: '/root[1]',
        name: 'root',
        isTableCandidate: true,
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/x[1]',
            name: 'x',
            siblingIndex: 1,
            siblingCount: 2,
            value: '1',
          }),
          makeNodeData({
            nodeId: '/root[1]/x[2]',
            name: 'x',
            siblingIndex: 2,
            siblingCount: 2,
            value: '2',
          }),
        ],
      }),
      3,
    );
    model.findNode('/root[1]/x[1]')!.toggleExpanded();
    const html = renderer.render(model);
    assert.ok(!html.includes('t-cell-hybrid'), 'pure-scalar run must not use hybrid cell class');
    assert.ok(!html.includes('r-trow-drill'), 'pure-scalar run must not inject a drill-down row');
    assert.ok(html.includes('r-trow'), 'scalar path still emits r-trow');
  });
});
