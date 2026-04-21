// Bug 2 & Bug 4 — data-cell paint attributes.
//
// These tests pin the render-time attributes that the runtime
// `applySelection` routine uses to paint data cells in the grid:
//
//  * Bug 2 (unflipped view): every attribute / elem-scalar / chevron
//    data cell must carry `data-cell-column-id="<columnId>"`. The
//    click dispatcher does NOT match on this attribute — so clicking
//    a data cell never hijacks column selection — but the paint loop
//    uses it to light up every cell whose column is selected.
//
//  * Bug 4 (flipped view): every flipped data cell must carry
//    `data-flip-row-id="<originalRowId>"` so the paint loop can
//    light up the whole visual column belonging to a row-selected
//    original row.
//
// The attributes must be present WITHOUT any row/column being
// selected — paint logic is runtime-only.

import * as assert from 'node:assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { createToggleState } from '../../grid-view/model/toggle-state';
import { makeNodeData } from './grid-renderer.test-helpers';

const GROUP_PARENT = '/root[1]/groupA[1]';

function buildHybridRunModel(): GridModel {
  const model = new GridModel();
  const mkItem = (idx: number): ReturnType<typeof makeNodeData> => {
    const nodeId = `${GROUP_PARENT}/item[${idx}]`;
    return makeNodeData({
      nodeId,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 3,
      isHybridTableCandidate: true,
      childCount: 3,
      attributes: [
        { name: 'id', value: `a${idx}` },
        { name: 'kind', value: `k${idx}` },
      ],
      children: [
        makeNodeData({ nodeId: `${nodeId}/name[1]`, name: 'name', value: `n${idx}` }),
        makeNodeData({ nodeId: `${nodeId}/value[1]`, name: 'value', value: `v${idx}` }),
        makeNodeData({
          nodeId: `${nodeId}/meta[1]`,
          name: 'meta',
          attributes: [{ name: 'owner', value: 'o' }],
        }),
      ],
    });
  };
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
          children: [mkItem(1), mkItem(2), mkItem(3)],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(GROUP_PARENT)!.isExpanded = true;
  model.findNode(`${GROUP_PARENT}/item[1]`)!.isExpanded = true;
  return model;
}

suite('data-cell paint attributes for Bug 2 and Bug 4', () => {
  test('unflipped hybrid run: data cells expose data-cell-column-id for every attr, elem-scalar and chevron column', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildHybridRunModel());
    // Expect at least one cell per column (id, kind, name, value, meta)
    // × 3 rows = 15 data cells carrying data-cell-column-id.
    const matches = html.match(/data-cell-column-id="[^"]+"/g) || [];
    assert.ok(
      matches.length >= 15,
      `expected >= 15 data-cell-column-id attributes; got ${matches.length}`,
    );
    // Each column id must appear at least 3 times (once per run row).
    const byId = new Map<string, number>();
    for (const m of matches) {
      const id = m.slice('data-cell-column-id="'.length, -1);
      byId.set(id, (byId.get(id) || 0) + 1);
    }
    for (const [id, count] of byId) {
      assert.ok(count >= 3, `column ${id} appears ${count} times, expected >= 3`);
    }
  });

  test('flipped hybrid run: data cells expose data-flip-row-id for every original row', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    const model = buildHybridRunModel();
    ts.setFlipped(GROUP_PARENT, true);
    renderer.setToggleState(ts);

    const html = renderer.render(model);
    const matches = html.match(/data-flip-row-id="[^"]+"/g) || [];
    // 5 visual rows × 3 original rows = 15 cells minimum.
    assert.ok(
      matches.length >= 15,
      `expected >= 15 data-flip-row-id attributes; got ${matches.length}`,
    );
    const byId = new Map<string, number>();
    for (const m of matches) {
      const id = m.slice('data-flip-row-id="'.length, -1);
      byId.set(id, (byId.get(id) || 0) + 1);
    }
    assert.strictEqual(byId.size, 3, 'three original rows represented');
    for (const [id, count] of byId) {
      assert.ok(count >= 5, `row ${id} appears ${count} times, expected >= 5`);
    }
  });

  test('unflipped data cells are not themselves column click targets (no data-column-id on t-cell data spans)', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildHybridRunModel());
    // A data cell is identified by having data-cell-column-id. Verify
    // none of those ALSO carries data-column-id.
    const re = /<span [^>]*data-cell-column-id="[^"]+"[^>]*>/g;
    const spans = html.match(re) || [];
    assert.ok(spans.length > 0, 'expected at least one data cell');
    for (const s of spans) {
      assert.ok(
        !s.includes(' data-column-id="'),
        `data cell must not carry data-column-id: ${s}`,
      );
    }
  });

  test('allChevron: expanded <alpha> drill-box is stamped with data-cell-column-id for the host column (Bug J)', () => {
    // Fixture mirrors `resources/sample_files/grid_b1_hybrid_tables.xml` S3
    // allChevron: each <entry> has <alpha>, <beta>, <gamma> each wrapping a
    // scalar <inner>. Expanding alpha on entry[1] must emit a `.g-drill-box`
    // wrapper carrying data-cell-column-id="<..>#col/alpha". A CSS descendant
    // rule paints every row inside that drill-box when the column is selected.
    const ROOT = '/root[1]';
    const GROUP = `${ROOT}/allChevron[1]`;
    const model = new GridModel();
    const mkEntry = (i: number) => {
      const entryId = `${GROUP}/entry[${i}]`;
      const mkChev = (name: string, val: string) => {
        const cid = `${entryId}/${name}[1]`;
        return makeNodeData({
          nodeId: cid,
          name,
          children: [
            makeNodeData({ nodeId: `${cid}/inner[1]`, name: 'inner', value: val }),
          ],
        });
      };
      return makeNodeData({
        nodeId: entryId,
        name: 'entry',
        siblingIndex: i,
        siblingCount: 3,
        isHybridTableCandidate: true,
        attributes: [{ name: 'id', value: `e${i}` }],
        children: [
          mkChev('alpha', `a${i}`),
          mkChev('beta', `b${i}`),
          mkChev('gamma', `g${i}`),
        ],
      });
    };
    model.setTreeData(
      makeNodeData({
        nodeId: ROOT,
        name: 'root',
        children: [
          makeNodeData({
            nodeId: GROUP,
            name: 'allChevron',
            isTableCandidate: true,
            children: [mkEntry(1), mkEntry(2), mkEntry(3)],
          }),
        ],
      }),
      4,
    );
    model.findNode(ROOT)!.isExpanded = true;
    model.findNode(GROUP)!.isExpanded = true;
    model.findNode(`${GROUP}/entry[1]`)!.isExpanded = true;
    model.findNode(`${GROUP}/entry[1]/alpha[1]`)!.isExpanded = true;

    const renderer = new GridRenderer();
    const html = renderer.render(model);

    // Drill-box for entry[1] alpha host must carry data-cell-column-id
    // for the alpha column.
    const m = /<div class="g-drill-box"[^>]*data-cell-column-id="([^"]+)"[^>]*data-parent-row-id="([^"]+)"/.exec(html);
    assert.ok(m, 'drill-box wrapper must be emitted');
    assert.ok(
      /#col\/alpha$/.test(m![1]),
      `drill-box must carry data-cell-column-id for the alpha column; got: ${m![1]}`,
    );
    assert.strictEqual(
      m![2],
      `${GROUP}/entry[1]`,
      'drill-box parent-row-id must reference entry[1]',
    );
    // The inner row itself still renders inside the drill-box, with its
    // own data-node-id — column paint now reaches it via the CSS
    // descendant rule on the wrapper (.g-drill-box.column-selected …).
    assert.ok(
      html.includes(`data-node-id="${GROUP}/entry[1]/alpha[1]/inner[1]"`),
      'drill-down <inner> row must be emitted inside the drill-box',
    );
  });
});
