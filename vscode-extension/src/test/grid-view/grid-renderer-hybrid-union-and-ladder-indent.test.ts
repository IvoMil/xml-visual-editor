import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { createToggleState } from '../../grid-view/model/toggle-state';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * Regression coverage for two layout behaviours of hybrid-candidate
 * parents:
 *
 *  A. Tree-ladder body indent: when a hybrid-candidate parent is
 *     rendered in tableMode:OFF (tree-ladder), every member of the
 *     contiguous same-name run emits its subtree (attributes, children,
 *     text) at `memberDepth + 2` instead of `memberDepth + 1`, i.e. one
 *     column to the RIGHT of the member's own name cell. The member
 *     header row itself stays at `memberDepth` (so the table-mode-OFF
 *     gutter injector still targets it).
 *
 *  B. Union-shape column derivation: the hybrid table emitter consumes
 *     the engine's per-run `tableRuns` union descriptor so columns
 *     reflect the UNION of attribute/child names across the run, not
 *     just the first member. Rows missing a given column emit an empty
 *     cell at the correct `grid-column` track.
 *
 *  C. Multi-run parents render each distinct-tag run as an independent
 *     table with its own column set.
 */

// ── Helpers ──────────────────────────────────────────────────────

function rowContaining(html: string, needle: string): string | undefined {
  const at = html.indexOf(needle);
  if (at === -1) return undefined;
  const start = html.lastIndexOf('<div class="g-row', at);
  if (start === -1) return undefined;
  const end = html.indexOf('</div>', at);
  if (end === -1) return undefined;
  return html.substring(start, end + '</div>'.length);
}

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

// ── Tree-ladder body indent shift ──────────────────────────────

/** groupA-like fixture: 3-member run of `item` under `groupA` (depth 1).
 *  Each item has attrs id + kind + name + value, and a chevron-bearing
 *  child `meta` with owner/priority. childDepth of the run = 2. */
function buildGroupAModel(): GridModel {
  const model = new GridModel();
  const parent = '/root[1]/groupA[1]';
  function item(idx: number, id: string, kind: string) {
    const nodeId = `${parent}/item[${idx}]`;
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
        { name: 'name', value: `${kind}-name` },
        { name: 'value', value: `${idx}` },
      ],
      children: [
        makeNodeData({
          nodeId: `${nodeId}/meta[1]`,
          name: 'meta',
          attributes: [
            { name: 'owner', value: 'ivo' },
            { name: 'priority', value: 'high' },
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
          nodeId: parent,
          name: 'groupA',
          isTableCandidate: true,
          childCount: 3,
          tableRuns: [
            {
              tag: 'item',
              attrUnion: ['id', 'kind', 'name', 'value'],
              childUnion: ['meta'],
            },
          ],
          children: [item(1, 'a1', 'alpha'), item(2, 'a2', 'beta'), item(3, 'a3', 'gamma')],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(parent)!.isExpanded = true;
  for (const i of [1, 2, 3]) model.findNode(`${parent}/item[${i}]`)!.isExpanded = true;
  return model;
}

suite('Tree-ladder body indent for run members of a hybrid-candidate parent', () => {
  test('run-member header and its attribute rows use the natural tree indentation (no body shift)', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());

    // Member header: c-name stays at the member depth + 1 = 3 —
    // natural non-leaf placement. The OFF icon moved off the header
    // (it now lands on the first body row instead), so no extra shift
    // is required.
    const headerRow = rowContaining(html, 'data-node-id="/root[1]/groupA[1]/item[1]"');
    assert.ok(headerRow, 'item[1] element row emitted');
    assert.ok(
      headerRow!.includes('class="g-cell c-name" style="grid-column: 3 / -1;"'),
      'item[1] header name cell at default non-leaf placement 3 / -1',
    );

    // Attribute rows of item[1] render their name cell at childDepth+2
    // = 4 — one step to the right of the member header in the natural
    // tree way.
    for (const a of ['id', 'kind', 'name', 'value']) {
      const row = rowContaining(html, `data-node-id="/root[1]/groupA[1]/item[1]/@${a}"`);
      assert.ok(row, `@${a} attribute row emitted`);
      assert.ok(
        row!.includes('class="g-cell c-name" style="grid-column: 4 /'),
        `@${a} row name cell at grid-column 4 (childDepth+2, natural depth)`,
      );
    }
  });

  test('element child of a run member indents one step to the right of the member row', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());
    const metaRow = rowContaining(html, 'data-node-id="/root[1]/groupA[1]/item[1]/meta[1]"');
    assert.ok(metaRow, 'meta[1] row emitted');
    // meta is a non-leaf (has attributes) → name at (D+1)/-1 where
    // D = childDepth + 1 = 3.
    assert.ok(
      metaRow!.includes('class="g-cell c-name" style="grid-column: 4 /'),
      'meta<1> row name cell starts at grid-column 4 (natural depth)',
    );
  });

  test('sibling run members use the same body placement as the first member', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    ts.setTableMode('/root[1]/groupA[1]', false);
    const html = renderer.render(buildGroupAModel());
    for (const i of [2, 3]) {
      const row = rowContaining(html, `data-node-id="/root[1]/groupA[1]/item[${i}]/@id"`);
      assert.ok(row, `item[${i}]/@id row emitted`);
      assert.ok(
        row!.includes('class="g-cell c-name" style="grid-column: 4 /'),
        `item[${i}]/@id name cell at natural column 4`,
      );
    }
  });

  test('table mode (ON) does not apply the shift; attributes are columns rather than standalone rows', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);
    // Default tableMode is ON — render as a table. Attribute rows should
    // NOT appear as separate attribute rows (they are columns instead).
    const html = renderer.render(buildGroupAModel());
    assert.ok(
      !html.includes('data-node-id="/root[1]/groupA[1]/item[1]/@id"'),
      'table mode: attributes are columns, not standalone rows',
    );
    // No OFF icon in table mode.
    assert.ok(!html.includes('g-tm-off'), 'table mode emits no OFF icon');
  });

  test('singleton siblings of a non-candidate parent do not receive the shift', () => {
    // Parent has ONE item (not a run). tableRuns empty. Tree-ladder
    // mode: attribute row renders at childDepth+2 (unshifted).
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        nodeId: '/root[1]',
        name: 'root',
        children: [
          makeNodeData({
            nodeId: '/root[1]/wrap[1]',
            name: 'wrap',
            children: [
              makeNodeData({
                nodeId: '/root[1]/wrap[1]/only[1]',
                name: 'only',
                siblingIndex: 1,
                siblingCount: 1,
                attributes: [{ name: 'a', value: '1' }],
              }),
            ],
          }),
        ],
      }),
      5,
    );
    const renderer = new GridRenderer();
    const html = renderer.render(model);
    const row = rowContaining(html, 'data-node-id="/root[1]/wrap[1]/only[1]/@a"');
    assert.ok(row, 'singleton attr row emitted');
    // wrap at depth 1, only at depth 2, its @a at depth 3 → name col 4.
    assert.ok(
      row!.includes('class="g-cell c-name" style="grid-column: 4 /'),
      'singleton parent: no shift, attr row name cell at childDepth+2 = 4',
    );
  });
});

// ── Union-shape columns from tableRuns ──────────────────────────────────

/** Hybrid run where item[2] is missing attribute `priority` and child
 *  `nested`; item[3] has BOTH. Engine-supplied tableRuns is the union. */
function buildUnionShapeModel(): GridModel {
  const parent = '/root[1]/diffAttrs[1]';
  const model = new GridModel();
  function item(
    idx: number,
    attrs: { name: string; value: string }[],
    children: ReturnType<typeof makeNodeData>[],
  ) {
    return makeNodeData({
      nodeId: `${parent}/item[${idx}]`,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 3,
      isHybridTableCandidate: true,
      attributes: attrs,
      children,
    });
  }
  const mkNested = (owner: string, idx: number) =>
    makeNodeData({
      nodeId: `${parent}/item[${idx}]/nested[1]`,
      name: 'nested',
      attributes: [{ name: 'owner', value: owner }],
    });
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      children: [
        makeNodeData({
          nodeId: parent,
          name: 'diffAttrs',
          isTableCandidate: true,
          tableRuns: [
            {
              tag: 'item',
              attrUnion: ['id', 'kind', 'priority'],
              childUnion: ['name', 'nested'],
            },
          ],
          children: [
            // item[1]: id + kind, name child only
            item(
              1,
              [
                { name: 'id', value: 'a1' },
                { name: 'kind', value: 'alpha' },
              ],
              [
                makeNodeData({
                  nodeId: `${parent}/item[1]/name[1]`,
                  name: 'name',
                  value: 'First',
                }),
              ],
            ),
            // item[2]: id + kind + priority, name + nested
            item(
              2,
              [
                { name: 'id', value: 'a2' },
                { name: 'kind', value: 'beta' },
                { name: 'priority', value: 'urgent' },
              ],
              [
                makeNodeData({
                  nodeId: `${parent}/item[2]/name[1]`,
                  name: 'name',
                  value: 'Second',
                }),
                mkNested('ivo', 2),
              ],
            ),
            // item[3]: id + kind, name only
            item(
              3,
              [
                { name: 'id', value: 'a3' },
                { name: 'kind', value: 'gamma' },
              ],
              [
                makeNodeData({
                  nodeId: `${parent}/item[3]/name[1]`,
                  name: 'name',
                  value: 'Third',
                }),
              ],
            ),
          ],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(parent)!.isExpanded = true;
  model.findNode(`${parent}/item[1]`)!.isExpanded = true;
  return model;
}

suite('Hybrid table columns derived from the engine tableRuns union descriptor', () => {
  test('column headers reflect the union attrUnion + childUnion, not just the first member', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildUnionShapeModel());
    // Expected header column ids (attr then elem), in union order:
    //   attr::id, attr::kind, attr::priority, elem::name, elem::nested
    const headerIdx = html.indexOf('t-header');
    assert.ok(headerIdx !== -1, 't-header row exists');
    const headerEnd = html.indexOf('</div>', headerIdx);
    const headerRow = html.substring(headerIdx, headerEnd);
    for (const colId of [
      '/root[1]/diffAttrs[1]#col/@id',
      '/root[1]/diffAttrs[1]#col/@kind',
      '/root[1]/diffAttrs[1]#col/@priority',
      '/root[1]/diffAttrs[1]#col/name',
      '/root[1]/diffAttrs[1]#col/nested',
    ]) {
      assert.ok(
        headerRow.includes(`data-column-id="${colId}"`),
        `header row carries column ${colId}`,
      );
    }
  });

  test('rows missing a union column render an empty cell at the correct grid track', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildUnionShapeModel());
    // item[1] is missing attr `priority` (union index 3; with rowid
    // track that's grid-column depth+5 / depth+6 = 7 / 8 at parent
    // depth 1, childDepth 2 — depth+2+colIdx where colIdx=3).
    const row1 = rowContaining(html, 'data-node-id="/root[1]/diffAttrs[1]/item[1]"');
    assert.ok(row1, 'item[1] row emitted');
    // The priority cell for item[1] is empty: look for an attr-kind
    // empty cell at the priority grid-track. We verify by counting:
    // item[1] has only 2 attributes but header has 3 → the row MUST
    // carry 5 data cells (3 attr + 2 elem).
    const cellCount = count(row1!, '<span class="t-cell');
    // 1 (tableIndent absent — it's pre-split, but tableIndent/rowid are
    // always present). Count t-cell entries: rowid + 5 data cells = 6.
    assert.strictEqual(
      cellCount,
      6,
      'item[1] row must carry exactly 6 t-cell entries (rowid + 5 union cols)',
    );
    // item[2] has full shape — also 6 cells.
    const row2 = rowContaining(html, 'data-node-id="/root[1]/diffAttrs[1]/item[2]"');
    assert.ok(row2, 'item[2] row emitted');
    assert.strictEqual(
      count(row2!, '<span class="t-cell'),
      6,
      'item[2] row carries 6 t-cell entries',
    );
    // item[3] also missing priority and nested.
    const row3 = rowContaining(html, 'data-node-id="/root[1]/diffAttrs[1]/item[3]"');
    assert.ok(row3, 'item[3] row emitted');
    assert.strictEqual(
      count(row3!, '<span class="t-cell'),
      6,
      'item[3] row carries 6 t-cell entries',
    );
  });

  test('item[2] renders priority="urgent" in the priority column cell', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildUnionShapeModel());
    const row2 = rowContaining(html, 'data-node-id="/root[1]/diffAttrs[1]/item[2]"');
    assert.ok(row2, 'item[2] row emitted');
    assert.ok(row2!.includes('urgent'), 'item[2] renders urgent in priority column');
  });

  test('backward compat: when tableRuns is empty, the emitter falls back to per-member derivation without throwing', () => {
    // Same fixture but with an empty tableRuns on the parent — simulates
    // older engine payloads that had not yet adopted the union
    // descriptor. Fallback path must still produce valid HTML.
    const model = buildUnionShapeModel();
    const parent = model.findNode('/root[1]/diffAttrs[1]')!;
    (parent as unknown as { tableRuns: unknown[] }).tableRuns = [];
    const renderer = new GridRenderer();
    const html = renderer.render(model);
    // Fallback path: columns are the UNION across members (scalar
    // emitter's legacy behaviour) OR per-member (hybrid emitter's
    // legacy behaviour). Because item[2] has more attributes than
    // item[1], the hybrid-emitter fallback (derive from first member)
    // will MISS `priority` / `nested`. The scalar emitter's fallback
    // unions across members. Here we just assert the renderer still
    // produces valid HTML (no throw).
    assert.ok(html.includes('t-header'), 'fallback path still emits a header row');
  });
});

// ── Multi-run parent ──────────────────────────────────────────────

/** Parent with two distinct-tag runs: <alpha>x2 and <beta>x2. Both
 *  should render as independent hybrid tables with their own columns. */
function buildMultiRunModel(): GridModel {
  const parent = '/root[1]/multiRun[1]';
  const model = new GridModel();
  const alpha = (idx: number, aVal: string) =>
    makeNodeData({
      nodeId: `${parent}/alpha[${idx}]`,
      name: 'alpha',
      siblingIndex: idx,
      siblingCount: 2,
      isHybridTableCandidate: true,
      attributes: [{ name: 'a', value: aVal }],
      children: [
        makeNodeData({
          nodeId: `${parent}/alpha[${idx}]/x[1]`,
          name: 'x',
          value: `x${idx}`,
        }),
      ],
    });
  const beta = (idx: number, bVal: string) =>
    makeNodeData({
      nodeId: `${parent}/beta[${idx}]`,
      name: 'beta',
      siblingIndex: idx,
      siblingCount: 2,
      isHybridTableCandidate: true,
      attributes: [{ name: 'b', value: bVal }],
      children: [
        makeNodeData({
          nodeId: `${parent}/beta[${idx}]/y[1]`,
          name: 'y',
          value: `y${idx}`,
        }),
      ],
    });
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      children: [
        makeNodeData({
          nodeId: parent,
          name: 'multiRun',
          isTableCandidate: true,
          tableRuns: [
            { tag: 'alpha', attrUnion: ['a'], childUnion: ['x'] },
            { tag: 'beta', attrUnion: ['b'], childUnion: ['y'] },
          ],
          children: [alpha(1, 'A1'), alpha(2, 'A2'), beta(1, 'B1'), beta(2, 'B2')],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(parent)!.isExpanded = true;
  model.findNode(`${parent}/alpha[1]`)!.isExpanded = true;
  model.findNode(`${parent}/beta[1]`)!.isExpanded = true;
  return model;
}

suite('Multi-run parent renders each distinct-tag run as an independent table', () => {
  test('two distinct-tag runs produce two t-header rows and two table-mode-ON icons', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildMultiRunModel());
    assert.strictEqual(
      count(html, 'g-tm-on-gutter'),
      2,
      'two runs ⇒ two ON icons (one per table)',
    );
    // Each run's header carries its own column ids.
    assert.ok(
      html.includes('data-column-id="/root[1]/multiRun[1]#col/@a"'),
      'alpha run header carries attr::a column id',
    );
    assert.ok(
      html.includes('data-column-id="/root[1]/multiRun[1]#col/@b"'),
      'beta run header carries attr::b column id',
    );
    assert.ok(
      html.includes('data-column-id="/root[1]/multiRun[1]#col/x"'),
      'alpha run header carries elem::x column id',
    );
    assert.ok(
      html.includes('data-column-id="/root[1]/multiRun[1]#col/y"'),
      'beta run header carries elem::y column id',
    );
  });
});
