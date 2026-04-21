// Drill-box invariants for chevron drill-down that nests a same-name
// run (rendered as a nested hybrid table) inside the host's drill-box.
//
// Architecture reminder: each expanded chevron host is rendered as a
// standalone `.g-drill-box` grid item. The wrapper owns its OWN grid
// template; rows inside are `display: contents` and therefore become
// direct grid children of the drill-box (not the outer grid-root).
// Same-name runs inside the host render as a hybrid sub-table via the
// shared `emitSegmentedChildren` -> `emitTableRegion` path.

import * as assert from 'node:assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { createToggleState } from '../../grid-view/model/toggle-state';
import { makeNodeData } from './grid-renderer.test-helpers';

const GROUP_PARENT = '/root[1]/outerGroup[1]';

function buildNestedHybridModel(): GridModel {
  const model = new GridModel();
  const mkSub = (hostMeta: string, idx: number) => {
    const id = `${hostMeta}/sub[${idx}]`;
    return makeNodeData({
      nodeId: id,
      name: 'sub',
      siblingIndex: idx,
      siblingCount: 2,
      attributes: [{ name: 'k', value: `k${idx}` }],
      children: [
        makeNodeData({ nodeId: `${id}/v[1]`, name: 'v', value: `${idx * 10}` }),
      ],
    });
  };
  const mkItem = (idx: number) => {
    const itemId = `${GROUP_PARENT}/item[${idx}]`;
    const metaId = `${itemId}/meta[1]`;
    return makeNodeData({
      nodeId: itemId,
      name: 'item',
      siblingIndex: idx,
      siblingCount: 2,
      isHybridTableCandidate: true,
      childCount: 2,
      attributes: [{ name: 'id', value: `i${idx}` }],
      children: [
        makeNodeData({ nodeId: `${itemId}/title[1]`, name: 'title', value: `T${idx}` }),
        makeNodeData({
          nodeId: metaId,
          name: 'meta',
          attributes: [{ name: 'owner', value: 'o' }],
          childCount: 2,
          children: [mkSub(metaId, 1), mkSub(metaId, 2)],
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
          name: 'outerGroup',
          isTableCandidate: true,
          childCount: 2,
          children: [mkItem(1), mkItem(2)],
        }),
      ],
    }),
    4,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(GROUP_PARENT)!.isExpanded = true;
  model.findNode(`${GROUP_PARENT}/item[1]`)!.isExpanded = true;
  // Expand meta to emit the drill-box wrapper.
  model.findNode(`${GROUP_PARENT}/item[1]/meta[1]`)!.isExpanded = true;
  // Expand the synthesised same-name `#group` header (keyed to sub[1])
  // so the nested hybrid table materialises inside the drill-box.
  model.findNode(`${GROUP_PARENT}/item[1]/meta[1]/sub[1]`)!.isExpanded = true;
  return model;
}

/** Extract the HTML segment of the drill-box owned by the given parent
 *  row. Returns '' when no drill-box is found. */
function drillBoxFor(html: string, parentRowId: string): string {
  const headOpen = html.indexOf(
    `<div class="g-drill-box" data-cell-column-id=`,
  );
  // Search for drill-box with matching data-parent-row-id.
  const re = new RegExp(
    `<div class=\"g-drill-box\"[^>]*data-parent-row-id=\"${parentRowId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\"[^>]*>`,
    'g',
  );
  const m = re.exec(html);
  if (!m) return '';
  const start = m.index;
  // The drill-box is self-closing at its matching </div>. Because its
  // contents can include nested drill-boxes (recursive), we match
  // balanced <div>/</div> pairs.
  let depth = 0;
  let i = start;
  while (i < html.length) {
    const nextOpen = html.indexOf('<div', i + 1);
    const nextClose = html.indexOf('</div>', i + 1);
    if (nextClose === -1) break;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      i = nextOpen;
    } else {
      if (depth === 0) {
        return html.substring(start, nextClose + '</div>'.length);
      }
      depth -= 1;
      i = nextClose;
    }
  }
  void headOpen;
  return '';
}

suite('GridRenderer — nested hybrid table inside drill-down', () => {
  test('Inv 1–4: chevron drill-down of a same-name run emits a .g-drill-box containing an <> sub (N) r-tregion-label followed by a t-header row', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildNestedHybridModel());

    const hostRowId = `${GROUP_PARENT}/item[1]`;
    const box = drillBoxFor(html, hostRowId);
    assert.ok(box.length > 0, 'drill-box for item[1] must be emitted');

    // Drill-box wrapper carries the HOST column id (meta column), so
    // a column-paint scanner can stamp column-selected on the entire
    // box via a descendant rule (Inv 8).
    assert.ok(
      /<div class="g-drill-box"[^>]*data-cell-column-id="[^"]*#col\/meta"/.test(box),
      `drill-box wrapper must carry data-cell-column-id for the meta column: ${box.substring(0, 400)}`,
    );

    // Inv 1 — r-tregion-label row with synthesised #group id and name.
    const groupId = `${GROUP_PARENT}/item[1]/meta[1]/sub[1]#group`;
    const labelIdx = box.indexOf(`data-node-id="${groupId}"`);
    assert.notStrictEqual(labelIdx, -1, 'r-tregion-label row for sub run must be emitted');
    const labelOpen = box.substring(box.lastIndexOf('<div', labelIdx), box.indexOf('>', labelIdx) + 1);
    assert.ok(/\br-tregion-label\b/.test(labelOpen), `label must carry r-tregion-label: ${labelOpen}`);
    // Inv 2 — chevron toggle present on the label row.
    const labelEnd = box.indexOf('</div>', labelIdx);
    const labelHtml = box.substring(labelIdx, labelEnd);
    assert.ok(
      /expand-toggle[^>]*data-node-id="[^"]*#group"/.test(labelHtml),
      `<> sub (2) header must carry a chevron toggle: ${labelHtml}`,
    );
    assert.ok(labelHtml.includes('(2)'), '<> sub (2) label must include run count');

    // Inv 4 — t-header row (the nested hybrid table header) follows,
    // with g-tm-on-gutter and g-flip-corner.
    const headerIdx = box.indexOf('t-header', labelIdx);
    assert.notStrictEqual(headerIdx, -1, 't-header row must appear after the label');
    const headerOpen = box.substring(
      box.lastIndexOf('<div', headerIdx),
      box.indexOf('>', headerIdx) + 1,
    );
    assert.ok(/\br-trow\b/.test(headerOpen), 't-header must be an r-trow');
    // Run members' values appear as cell content of the data rows.
    assert.ok(box.includes('k1') && box.includes('k2'), 'both sub @k attrs render in data rows');
    assert.ok(box.includes('>10<') || box.includes('"10"'), 'sub[1]/v value renders');
  });

  test('Inv 8: drill-box wrapper is stamped with data-cell-column-id for the host column (enables column-paint via descendant rule)', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildNestedHybridModel());
    const box = drillBoxFor(html, `${GROUP_PARENT}/item[1]`);
    const m = /<div class="g-drill-box"[^>]*data-cell-column-id="([^"]+)"/.exec(box);
    assert.ok(m, `drill-box must carry data-cell-column-id: ${box.substring(0, 200)}`);
    assert.ok(/#col\/meta$/.test(m![1]), `column-id must end with #col/meta: ${m![1]}`);
  });

  test('Inv 4: nested t-header carries both flip and table-mode-ON icons keyed to the run toggle-key', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildNestedHybridModel());
    const box = drillBoxFor(html, `${GROUP_PARENT}/item[1]`);
    // Single run under meta → toggle-key collapses to meta's nodeId.
    const toggleKey = `${GROUP_PARENT}/item[1]/meta[1]`;
    const headerIdx = box.indexOf('t-header');
    const headerEnd = box.indexOf('</div>', headerIdx);
    const headerHtml = box.substring(box.lastIndexOf('<div', headerIdx), headerEnd);
    assert.ok(
      headerHtml.includes('data-action="toggle-flip"'),
      `header must contain flip icon: ${headerHtml}`,
    );
    assert.ok(
      headerHtml.includes(`data-parent-node-id="${toggleKey}"`),
      `flip/table-mode icons must be keyed to the run toggle-key (${toggleKey}): ${headerHtml}`,
    );
    assert.ok(
      headerHtml.includes('data-action="toggle-table-mode"'),
      `header must contain table-mode-ON icon: ${headerHtml}`,
    );
    // Column headers for the union shape — attr k and elem v.
    assert.ok(headerHtml.includes('= k'), `column header for attr k missing: ${headerHtml}`);
    assert.ok(
      headerHtml.includes('&lt;&gt; v'),
      `column header for element v missing: ${headerHtml}`,
    );
  });

  test('Inv 3: composite singleton-with-inner-run drills to a <> groupH1 tree row whose attrs and nested hybrid table render at drill-box depth 1', () => {
    // Outer item[1] -> meta -> groupH1 (singleton with attrs + inner run).
    const ROOT = '/root[1]';
    const GROUP = `${ROOT}/groupH[1]`;
    const model = new GridModel();
    const mkInner = (h1: string, i: number) =>
      makeNodeData({
        nodeId: `${h1}/inner[${i}]`,
        name: 'inner',
        siblingIndex: i,
        siblingCount: 3,
        attributes: [{ name: 'id', value: `h_${i}` }],
      });
    const mkItem = (i: number) => {
      const itemId = `${GROUP}/item[${i}]`;
      const metaId = `${itemId}/meta[1]`;
      const h1Id = `${metaId}/groupH1[1]`;
      return makeNodeData({
        nodeId: itemId,
        name: 'item',
        siblingIndex: i,
        siblingCount: 2,
        isHybridTableCandidate: true,
        attributes: [{ name: 'id', value: `h${i}` }],
        children: [
          makeNodeData({
            nodeId: metaId,
            name: 'meta',
            attributes: [
              { name: 'owner', value: 'ivo' },
              { name: 'priority', value: 'high' },
            ],
            children: [
              makeNodeData({
                nodeId: h1Id,
                name: 'groupH1',
                // Inner run must be rendered as a hybrid sub-table → flag
                // groupH1 as table-candidate so emitNode routes its children
                // through `emitSegmentedChildren`.
                isTableCandidate: true,
                attributes: [
                  { name: 'id', value: 'H1' },
                  { name: 'label', value: 'L' },
                ],
                children: [mkInner(h1Id, 1), mkInner(h1Id, 2), mkInner(h1Id, 3)],
              }),
            ],
          }),
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
            name: 'groupH',
            isTableCandidate: true,
            children: [mkItem(1), mkItem(2)],
          }),
        ],
      }),
      5,
    );
    model.findNode(ROOT)!.isExpanded = true;
    model.findNode(GROUP)!.isExpanded = true;
    model.findNode(`${GROUP}/item[1]`)!.isExpanded = true;
    model.findNode(`${GROUP}/item[1]/meta[1]`)!.isExpanded = true;
    // Must also expand groupH1 to see its attrs + inner run inside.
    model.findNode(`${GROUP}/item[1]/meta[1]/groupH1[1]`)!.isExpanded = true;
    // And expand the inner `#group` header so the nested hybrid table
    // materialises for the three <inner> members.
    model.findNode(`${GROUP}/item[1]/meta[1]/groupH1[1]/inner[1]`)!.isExpanded = true;

    const html = new GridRenderer().render(model);
    const box = drillBoxFor(html, `${GROUP}/item[1]`);
    assert.ok(box.length > 0, 'drill-box for item[1] must exist');

    // Meta's own attr rows (depth 0 of drill-box).
    assert.ok(
      box.includes(`data-node-id="${GROUP}/item[1]/meta[1]/@owner"`),
      'meta @owner attr row must be emitted at drill-box depth 0',
    );

    // groupH1 singleton tree-node row at drill-box depth 0.
    const h1Id = `${GROUP}/item[1]/meta[1]/groupH1[1]`;
    const h1Idx = box.indexOf(`data-node-id="${h1Id}"`);
    assert.notStrictEqual(h1Idx, -1, 'groupH1 singleton row must be emitted');
    const h1Open = box.substring(box.lastIndexOf('<div', h1Idx), box.indexOf('>', h1Idx) + 1);
    assert.ok(/data-depth="0"/.test(h1Open), `groupH1 row must be at drill-box depth 0: ${h1Open}`);

    // groupH1 attrs follow at depth 1.
    const h1IdAttrIdx = box.indexOf(`data-node-id="${h1Id}/@id"`);
    assert.notStrictEqual(h1IdAttrIdx, -1, 'groupH1 @id attr row must be emitted');
    assert.ok(h1Idx < h1IdAttrIdx, 'attrs follow the groupH1 header row');
    const attrOpen = box.substring(
      box.lastIndexOf('<div', h1IdAttrIdx),
      box.indexOf('>', h1IdAttrIdx) + 1,
    );
    assert.ok(
      /data-depth="1"/.test(attrOpen),
      `groupH1 attr row must be at drill-box depth 1: ${attrOpen}`,
    );

    // Nested hybrid table for the inner run follows, at depth 1.
    const innerGroupId = `${h1Id}/inner[1]#group`;
    const innerIdx = box.indexOf(`data-node-id="${innerGroupId}"`);
    assert.notStrictEqual(innerIdx, -1, 'nested hybrid #group label for inner run must be emitted');
    assert.ok(h1IdAttrIdx < innerIdx, 'inner run nested table follows groupH1 attrs');
    // All three inner members appear as data rows.
    assert.ok(box.includes('h_1') && box.includes('h_2') && box.includes('h_3'),
      'three inner members render in nested-table data rows');
  });

  test('Inv 5: tree-ladder fallback — when the nested same-name run has table-mode OFF, each member emits its own r-tree row with attrs at depth+1', () => {
    const model = buildNestedHybridModel();
    // Both run members must be expanded for their attr rows to render
    // in the tree-ladder fallback.
    model.findNode(`${GROUP_PARENT}/item[1]/meta[1]/sub[2]`)!.isExpanded = true;
    const ts = createToggleState();
    // meta has a single run → toggle-key collapses to meta's nodeId.
    ts.setTableMode(`${GROUP_PARENT}/item[1]/meta[1]`, false);
    const renderer = new GridRenderer();
    renderer.setToggleState(ts);
    const html = renderer.render(model);
    const box = drillBoxFor(html, `${GROUP_PARENT}/item[1]`);
    assert.ok(box.length > 0, 'drill-box for item[1] must exist');

    const sub1Id = `${GROUP_PARENT}/item[1]/meta[1]/sub[1]`;
    const sub2Id = `${GROUP_PARENT}/item[1]/meta[1]/sub[2]`;
    const sub1Idx = box.indexOf(`data-node-id="${sub1Id}"`);
    const sub2Idx = box.indexOf(`data-node-id="${sub2Id}"`);
    const attr1Idx = box.indexOf(`data-node-id="${sub1Id}/@k"`);
    const attr2Idx = box.indexOf(`data-node-id="${sub2Id}/@k"`);
    assert.notStrictEqual(sub1Idx, -1, 'sub[1] tree-ladder row must emit');
    assert.notStrictEqual(sub2Idx, -1, 'sub[2] tree-ladder row must emit');
    assert.notStrictEqual(attr1Idx, -1, 'sub[1] @k attr row must emit');
    assert.notStrictEqual(attr2Idx, -1, 'sub[2] @k attr row must emit');
    assert.ok(sub1Idx < attr1Idx && attr1Idx < sub2Idx && sub2Idx < attr2Idx,
      'order: sub[1], sub[1]@k, sub[2], sub[2]@k');

    const openAt = (idx: number): string =>
      box.substring(box.lastIndexOf('<div', idx), box.indexOf('>', idx) + 1);
    const subDepth = Number(/data-depth="(\d+)"/.exec(openAt(sub1Idx))![1]);
    const attrDepth = Number(/data-depth="(\d+)"/.exec(openAt(attr1Idx))![1]);
    assert.strictEqual(attrDepth, subDepth + 1, 'attr row depth == member row depth + 1');
  });

  test('Inv 4: nested t-header still carries the ⊟ table-mode icon in the g-tm-on-gutter cell (not in any column-header cell)', () => {
    const html = new GridRenderer().render(buildNestedHybridModel());
    const box = drillBoxFor(html, `${GROUP_PARENT}/item[1]`);
    const headerIdx = box.indexOf('t-header');
    assert.notStrictEqual(headerIdx, -1, 't-header must be present');
    const headerEnd = box.indexOf('</div>', headerIdx);
    const headerHtml = box.substring(box.lastIndexOf('<div', headerIdx), headerEnd);
    const onIcon = /<span[^>]*data-action="toggle-table-mode"[^>]*>[^<]*<\/span>/.exec(headerHtml);
    assert.ok(onIcon, `⊟ table-mode-ON icon missing from t-header: ${headerHtml}`);
    const iconStart = headerHtml.indexOf(onIcon![0]);
    const enclosing = headerHtml.lastIndexOf('<span', iconStart - 1);
    const enclosingTag = headerHtml.substring(enclosing, headerHtml.indexOf('>', enclosing) + 1);
    assert.ok(
      /\bg-tm-on-gutter\b/.test(enclosingTag),
      `⊟ icon must be inside g-tm-on-gutter cell: ${enclosingTag}`,
    );
    assert.ok(
      !/\bg-col-header\b/.test(enclosingTag),
      `⊟ icon must NOT be inside a column-header cell: ${enclosingTag}`,
    );
  });

  test('Inv 4: drill-box wrapper owns grid-template-columns for the nested table; rows inside do NOT repeat it', () => {
    const html = new GridRenderer().render(buildNestedHybridModel());
    const box = drillBoxFor(html, `${GROUP_PARENT}/item[1]`);
    // Wrapper declares its own grid-template-columns (set inline on the
    // .g-drill-box style attribute).
    const wrapperOpen = box.substring(0, box.indexOf('>') + 1);
    assert.ok(
      /grid-template-columns:\s*repeat\(\d+,\s*max-content\)/.test(wrapperOpen),
      `drill-box must declare its own grid-template-columns: ${wrapperOpen}`,
    );
    // Rows inside the drill-box use display: contents and must not
    // redeclare grid-template-columns (the wrapper owns the layout).
    const inner = box.substring(wrapperOpen.length, box.length - '</div>'.length);
    assert.ok(
      !/grid-template-columns/.test(inner),
      'rows inside the drill-box must not declare their own grid-template-columns',
    );
  });
});
