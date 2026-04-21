import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { createToggleState } from '../../grid-view/model/toggle-state';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * Behaviour coverage for the chevron drill-down path inside hybrid table
 * regions — both unflipped and flipped layouts. Fixture mirrors the
 * `groupA` section of `resources/sample_files/grid_expand_collaps_select.xml`
 * (three `<item>` children each carrying attrs `id`/`kind`, scalar
 * children `name`/`value`, and a chevron-bearing `<meta owner priority/>`).
 */
suite('GridRenderer — hybrid chevron drill-down layout', () => {
  function makeItem(
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

  function buildModel(): GridModel {
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
              makeItem(
                1,
                { id: 'a1', kind: 'alpha' },
                { name: 'First A item', value: '11' },
                { owner: 'ivo', priority: 'high' },
              ),
              makeItem(
                2,
                { id: 'a2', kind: 'beta' },
                { name: 'Second A item', value: '22' },
                { owner: 'bob', priority: 'low' },
              ),
              makeItem(
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
    model.findNode('/root[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupA[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupA[1]/item[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupA[1]/item[2]')!.isExpanded = true;
    model.findNode('/root[1]/groupA[1]/item[3]')!.isExpanded = true;
    return model;
  }

  function extractRowOpen(html: string, anchor: string): string {
    const idx = html.indexOf(anchor);
    assert.notStrictEqual(idx, -1, `anchor not found: ${anchor}`);
    const rowStart = html.lastIndexOf('<div', idx);
    return html.substring(rowStart, html.indexOf('>', idx) + 1);
  }
  void extractRowOpen; // retained helper, kept for future column-scoped assertions

  // ── Unflipped hybrid ───────────────────────────────────────────────────

  test('unflipped: expanding one item meta drills only that item, not its siblings', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const renderer = new GridRenderer();
    const html = renderer.render(model);

    assert.ok(
      html.includes('data-node-id="/root[1]/groupA[1]/item[1]/meta[1]/@owner"'),
      'item[1] meta drill-down owner row must be emitted',
    );
    assert.ok(
      !html.includes('data-node-id="/root[1]/groupA[1]/item[2]/meta[1]/@owner"'),
      'item[2] meta drill-down must NOT be emitted',
    );
    assert.ok(
      !html.includes('data-node-id="/root[1]/groupA[1]/item[3]/meta[1]/@owner"'),
      'item[3] meta drill-down must NOT be emitted',
    );
  });

  test('unflipped: drill-box wrapper is bounded to the meta column track (not / -1)', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const renderer = new GridRenderer();
    const html = renderer.render(model);

    const m = html.match(
      /<div class="g-drill-box"[^>]*data-parent-row-id="\/root\[1\]\/groupA\[1\]\/item\[1\]"[^>]*style="([^"]+)"/,
    );
    assert.ok(m, 'drill-box wrapper for item[1] present');
    const styleMatch = m![1].match(/grid-column:\s*(\d+)\s*\/\s*(\d+)/);
    assert.ok(styleMatch, `drill-box wrapper must carry a bounded grid-column; got: ${m![1]}`);
    const start = Number(styleMatch![1]);
    const end = Number(styleMatch![2]);
    assert.strictEqual(end, start + 1, 'drill-box wrapper spans a single outer column track');
  });

  test('unflipped: outer-row non-host cells carry grid-row: span 2 when any chevron is expanded', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const renderer = new GridRenderer();
    const html = renderer.render(model);

    const rowIdx = html.indexOf('data-node-id="/root[1]/groupA[1]/item[1]"');
    const rowEnd = html.indexOf('</div>', rowIdx);
    const rowFragment = html.substring(rowIdx, rowEnd);
    // The drill-box owns its own internal grid, so the outer row only needs
    // to reserve a single extra grid-row for the wrapper -> span 2.
    assert.ok(
      /grid-row:\s*span\s*2/.test(rowFragment),
      `outer-row non-host cells must carry grid-row: span 2; got: ${rowFragment.substring(0, 400)}`,
    );
  });

  test('unflipped: drill-down appears BETWEEN row 1 and row 2 in emitted order', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const renderer = new GridRenderer();
    const html = renderer.render(model);

    const row1Idx = html.indexOf('data-node-id="/root[1]/groupA[1]/item[1]"');
    const row2Idx = html.indexOf('data-node-id="/root[1]/groupA[1]/item[2]"');
    const ownerIdx = html.indexOf(
      'data-node-id="/root[1]/groupA[1]/item[1]/meta[1]/@owner"',
    );
    const priorityIdx = html.indexOf(
      'data-node-id="/root[1]/groupA[1]/item[1]/meta[1]/@priority"',
    );

    assert.ok(row1Idx < ownerIdx, 'owner appears after item[1]');
    assert.ok(ownerIdx < priorityIdx, 'priority appears after owner');
    assert.ok(priorityIdx < row2Idx, 'drill-down ends before item[2]');
  });

  test('unflipped: pure-scalar table region does NOT emit drill-down rows', () => {
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
    model.findNode('/root[1]')!.isExpanded = true;
    const renderer = new GridRenderer();
    const html = renderer.render(model);
    assert.ok(!html.includes('r-trow-nested'), 'no drill-down row in pure scalar table');
  });

  // ── Flipped hybrid ─────────────────────────────────────────────────────

  test('flipped: expanding one item meta drills only that item, not its siblings', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const ts = createToggleState();
    ts.setFlipped('/root[1]/groupA[1]', true);
    const renderer = new GridRenderer();
    renderer.setToggleState(ts);
    const html = renderer.render(model);

    assert.ok(
      html.includes('data-node-id="/root[1]/groupA[1]/item[1]/meta[1]/@owner"'),
      'item[1] drill-down owner emitted',
    );
    assert.ok(
      !html.includes('data-node-id="/root[1]/groupA[1]/item[2]/meta[1]/@owner"'),
      'item[2] drill-down must NOT be emitted',
    );
    assert.ok(
      !html.includes('data-node-id="/root[1]/groupA[1]/item[3]/meta[1]/@owner"'),
      'item[3] drill-down must NOT be emitted',
    );
  });

  test('flipped: drill-box wrappers are keyed to their host item row', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupA[1]/item[3]/meta[1]')!.isExpanded = true;
    const ts = createToggleState();
    ts.setFlipped('/root[1]/groupA[1]', true);
    const renderer = new GridRenderer();
    renderer.setToggleState(ts);
    const html = renderer.render(model);

    // There must be a drill-box wrapper whose data-parent-row-id is item[1],
    // and another whose data-parent-row-id is item[3].
    const m1 = html.match(
      /<div class="g-drill-box"[^>]*data-parent-row-id="\/root\[1\]\/groupA\[1\]\/item\[1\]"/,
    );
    const m3 = html.match(
      /<div class="g-drill-box"[^>]*data-parent-row-id="\/root\[1\]\/groupA\[1\]\/item\[3\]"/,
    );
    assert.ok(m1, 'drill-box for item[1] present');
    assert.ok(m3, 'drill-box for item[3] present');
    // item[2] meta is NOT expanded, so no drill-box for item[2].
    assert.ok(
      !/<div class="g-drill-box"[^>]*data-parent-row-id="\/root\[1\]\/groupA\[1\]\/item\[2\]"/.test(html),
      'no drill-box for unexpanded item[2]',
    );
  });

  test('flipped: expanded-item drill-down items appear in emission order after the meta row', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[2]/meta[1]')!.isExpanded = true;
    const ts = createToggleState();
    ts.setFlipped('/root[1]/groupA[1]', true);
    const renderer = new GridRenderer();
    renderer.setToggleState(ts);
    const html = renderer.render(model);

    const ownerIdx = html.indexOf(
      'data-node-id="/root[1]/groupA[1]/item[2]/meta[1]/@owner"',
    );
    const priorityIdx = html.indexOf(
      'data-node-id="/root[1]/groupA[1]/item[2]/meta[1]/@priority"',
    );
    assert.ok(ownerIdx !== -1, 'owner drill-down present');
    assert.ok(ownerIdx < priorityIdx, 'priority follows owner');
  });

  test('flipped: drill-box wrapper is bounded to the host item column (not / -1)', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const ts = createToggleState();
    ts.setFlipped('/root[1]/groupA[1]', true);
    const renderer = new GridRenderer();
    renderer.setToggleState(ts);
    const html = renderer.render(model);

    const m = html.match(
      /<div class="g-drill-box"[^>]*data-parent-row-id="\/root\[1\]\/groupA\[1\]\/item\[1\]"[^>]*style="([^"]+)"/,
    );
    assert.ok(m, 'flipped drill-box wrapper for item[1] present');
    const styleMatch = m![1].match(/grid-column:\s*(\d+)\s*\/\s*(\d+)/);
    assert.ok(styleMatch, `flipped drill-box must carry a bounded grid-column; got: ${m![1]}`);
    assert.strictEqual(
      Number(styleMatch![2]),
      Number(styleMatch![1]) + 1,
      'drill-box wrapper spans exactly one outer column track',
    );
  });

  test('flipped: meta row non-host cells carry grid-row: span 2 when any item drills', () => {
    const model = buildModel();
    model.findNode('/root[1]/groupA[1]/item[1]/meta[1]')!.isExpanded = true;
    const ts = createToggleState();
    ts.setFlipped('/root[1]/groupA[1]', true);
    const renderer = new GridRenderer();
    renderer.setToggleState(ts);
    const html = renderer.render(model);

    // The flipped meta row is emitted as a div with data-flip-col-name="meta".
    const rowIdx = html.indexOf('data-flip-col-name="meta"');
    assert.ok(rowIdx !== -1, 'flipped meta row present');
    const rowEnd = html.indexOf('</div>', rowIdx);
    const rowFragment = html.substring(rowIdx, rowEnd);
    // Drill-box owns its own internal grid, so non-host cells span 2.
    assert.ok(
      /grid-row:\s*span\s*2/.test(rowFragment),
      `flipped meta row non-host cells must carry grid-row: span 2; got: ${rowFragment.substring(0, 400)}`,
    );
  });
});
