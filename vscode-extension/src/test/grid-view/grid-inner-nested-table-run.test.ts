// Bug 6 — inner groupH1 run must render as a hybrid/scalar table, not
// as a tree ladder, when the user drills into it via a parent
// chevron. The outer `groupH` is already rendered as a table; when a
// user expands `groupH/item[k]/meta/groupH1`, the three inner
// `groupH1/item[*]` rows form a run that must itself be recognized
// as a table candidate and emitted with a `.t-header` row.
//
// This mirrors the F1 fixture structure
// (resources/sample_files/grid_expand_collaps_select.xml) but builds
// the model directly so the test does not depend on the engine.

import * as assert from 'node:assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { makeNodeData } from './grid-renderer.test-helpers';

suite('inner nested table run renders with its own t-header when drilled into', () => {
  test('groupH1 run inside meta of an expanded groupH item emits a t-header', () => {
    // Build: root > groupH > item[1..3] each with a meta that
    // contains groupH1 > item[1..3] (the inner run).
    const model = new GridModel();

    const mkInnerItem = (parent: string, idx: number): ReturnType<typeof makeNodeData> => {
      const nodeId = `${parent}/item[${idx}]`;
      return makeNodeData({
        nodeId,
        name: 'item',
        siblingIndex: idx,
        siblingCount: 3,
        attributes: [
          { name: 'code', value: `c${idx}` },
        ],
        children: [
          makeNodeData({ nodeId: `${nodeId}/label[1]`, name: 'label', value: `l${idx}` }),
          makeNodeData({ nodeId: `${nodeId}/qty[1]`, name: 'qty', value: `${idx}` }),
        ],
      });
    };

    const mkOuterItem = (idx: number): ReturnType<typeof makeNodeData> => {
      const nodeId = `/root[1]/groupH[1]/item[${idx}]`;
      const groupH1Id = `${nodeId}/meta[1]/groupH1[1]`;
      return makeNodeData({
        nodeId,
        name: 'item',
        siblingIndex: idx,
        siblingCount: 3,
        isHybridTableCandidate: true,
        attributes: [{ name: 'id', value: `o${idx}` }],
        children: [
          makeNodeData({ nodeId: `${nodeId}/title[1]`, name: 'title', value: `T${idx}` }),
          makeNodeData({
            nodeId: `${nodeId}/meta[1]`,
            name: 'meta',
            attributes: [{ name: 'owner', value: 'o' }],
            children: [
              makeNodeData({
                nodeId: groupH1Id,
                name: 'groupH1',
                isTableCandidate: true,
                childCount: 3,
                children: [
                  mkInnerItem(groupH1Id, 1),
                  mkInnerItem(groupH1Id, 2),
                  mkInnerItem(groupH1Id, 3),
                ],
              }),
            ],
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
            nodeId: '/root[1]/groupH[1]',
            name: 'groupH',
            isTableCandidate: true,
            childCount: 3,
            children: [mkOuterItem(1), mkOuterItem(2), mkOuterItem(3)],
          }),
        ],
      }),
      4,
    );

    // Expand outer table context and the first outer item so its
    // chevron cells are expandable. Also expand meta and groupH1 on
    // item[1] to drill down into the inner run.
    model.findNode('/root[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupH[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupH[1]/item[1]')!.isExpanded = true;
    model.findNode('/root[1]/groupH[1]/item[1]/meta[1]')!.isExpanded = true;
    const innerGroupH1 = model.findNode(
      '/root[1]/groupH[1]/item[1]/meta[1]/groupH1[1]',
    )!;
    innerGroupH1.isExpanded = true;
    // Share-state semantics: inner run renders data rows only when
    // the first member is expanded.
    model.findNode(
      '/root[1]/groupH[1]/item[1]/meta[1]/groupH1[1]/item[1]',
    )!.isExpanded = true;

    const renderer = new GridRenderer();
    const html = renderer.render(model);

    // The inner groupH1 run must contribute at least one t-header
    // row when drilled into. Root-scoped existence check: there are
    // two t-header rows total — outer groupH's header and the inner
    // groupH1 header. The outer header's node ids reference the
    // outer item; the inner header's children references reference
    // `/groupH1[1]/item[1]`.
    const innerItemNeedle = '/root[1]/groupH[1]/item[1]/meta[1]/groupH1[1]/item[1]';
    const headerRe = /<div class="[^"]*\bt-header\b[^"]*"[^>]*>([\s\S]*?)<\/div>/g;
    let sawInnerHeader = false;
    let m = headerRe.exec(html);
    while (m !== null) {
      if (m[0].includes(innerItemNeedle) || m[0].includes('groupH1')) {
        sawInnerHeader = true;
      }
      m = headerRe.exec(html);
    }
    assert.ok(
      sawInnerHeader,
      `expected a t-header row for the inner groupH1 run. HTML excerpt:\n${
        html.substring(
          Math.max(0, html.indexOf('groupH1') - 50),
          Math.min(html.length, html.indexOf('groupH1') + 500),
        )
      }`,
    );
  });
});
