import { strict as assert } from 'assert';
import { GridNode } from '../../grid-view/model/grid-node';
import { collectRenderableIds } from '../../grid-view/model/collect-renderable-ids';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * Regression tests for B.6 post-verification Bug 1: table-region
 * `#group` header rows lost their `.selected` class after a re-render
 * triggered by batch `+` / `-`. Root cause: the host-driven reconcile
 * used a tree walk that did not know about synthesized `#group` ids,
 * so they were filtered out of `existingIds`.
 *
 * `collectRenderableIds` mirrors the renderer's table-run grouping rule
 * and must include a `#group` id for every contiguous multi-element
 * run under a table-candidate parent.
 */
suite('collectRenderableIds — synthesized #group header ids are included so host reconcile preserves selection highlight after batch expand/collapse', () => {
  test('includes synthesized #group id for contiguous same-name run', () => {
    const root = new GridNode(
      makeNodeData({
        nodeId: '/root[1]',
        isTableCandidate: true,
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingIndex: 1,
            siblingCount: 2,
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingIndex: 2,
            siblingCount: 2,
          }),
        ],
      }),
    );

    const ids = collectRenderableIds(root);
    assert.ok(ids.includes('/root[1]'), 'root id present');
    assert.ok(ids.includes('/root[1]/item[1]'), 'first run node id present');
    assert.ok(ids.includes('/root[1]/item[2]'), 'second run node id present');
    assert.ok(
      ids.includes('/root[1]/item[1]#group'),
      'synthesized #group id must be emitted so the .r-tregion-label row survives reconcile',
    );
  });

  test('does NOT drop #group ids that were selected alongside real-node ids', () => {
    // Matches the user-reported log: a real tree node and a #group header
    // row are both in the selection. After reconcile against a tree shape
    // that includes the real node, the #group id must NOT be dropped.
    const root = new GridNode(
      makeNodeData({
        nodeId: '/timeSeriesImportRun[1]',
        childCount: 1,
        children: [
          makeNodeData({
            nodeId: '/timeSeriesImportRun[1]/import[1]',
            name: 'import',
            childCount: 3,
            children: [
              makeNodeData({
                nodeId: '/timeSeriesImportRun[1]/import[1]/general[1]',
                name: 'general',
                siblingIndex: 1,
                siblingCount: 1,
              }),
              makeNodeData({
                nodeId: '/timeSeriesImportRun[1]/import[1]/timeSeriesSet[1]',
                name: 'timeSeriesSet',
                siblingIndex: 1,
                siblingCount: 2,
                isTableCandidate: true,
                childCount: 1,
                children: [
                  makeNodeData({
                    nodeId: '/timeSeriesImportRun[1]/import[1]/timeSeriesSet[1]/x[1]',
                    name: 'x',
                    siblingIndex: 1,
                    siblingCount: 2,
                  }),
                  makeNodeData({
                    nodeId: '/timeSeriesImportRun[1]/import[1]/timeSeriesSet[1]/x[2]',
                    name: 'x',
                    siblingIndex: 2,
                    siblingCount: 2,
                  }),
                ],
              }),
              makeNodeData({
                nodeId: '/timeSeriesImportRun[1]/import[1]/timeSeriesSet[2]',
                name: 'timeSeriesSet',
                siblingIndex: 2,
                siblingCount: 2,
              }),
            ],
          }),
        ],
      }),
    );

    const ids = new Set(collectRenderableIds(root));
    assert.ok(
      ids.has('/timeSeriesImportRun[1]/import[1]/general[1]'),
      'sibling real-node id present',
    );
    assert.ok(
      ids.has('/timeSeriesImportRun[1]/import[1]/timeSeriesSet[1]/x[1]#group'),
      'selected #group id must survive reconcile',
    );
  });

  test('omits #group id when there is no multi-element run', () => {
    const root = new GridNode(
      makeNodeData({
        nodeId: '/root[1]',
        isTableCandidate: true,
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]',
            name: 'a',
            siblingIndex: 1,
            siblingCount: 1,
          }),
          makeNodeData({
            nodeId: '/root[1]/b[1]',
            name: 'b',
            siblingIndex: 1,
            siblingCount: 1,
          }),
        ],
      }),
    );
    const ids = collectRenderableIds(root);
    assert.ok(!ids.some((id) => id.endsWith('#group')), 'no #group ids for singleton children');
  });
});

suite('collectRenderableIds — attribute and text ids', () => {
  test('attribute ids are emitted so reconcile does not drop them after growth', () => {
    const root = new GridNode(
      makeNodeData({
        nodeId: '/root[1]',
        attributes: [
          { name: 'id', value: '1' },
          { name: 'name', value: 'x' },
        ],
      }),
    );
    const ids = collectRenderableIds(root);
    assert.ok(
      ids.includes('/root[1]/@id'),
      'attribute /root[1]/@id must be in existingIds so growth survives reconcile',
    );
    assert.ok(ids.includes('/root[1]/@name'));
  });

  test('synthesized /#text id is emitted for elements with attrs + text, no children', () => {
    const root = new GridNode(
      makeNodeData({
        nodeId: '/root[1]',
        value: 'hello',
        attributes: [{ name: 'a', value: '1' }],
      }),
    );
    const ids = collectRenderableIds(root);
    assert.ok(ids.includes('/root[1]/#text'));
  });

  test('attribute ids emitted regardless of element expansion state (permissive)', () => {
    const root = new GridNode(
      makeNodeData({
        nodeId: '/root[1]',
        attributes: [{ name: 'id', value: '1' }],
      }),
    );
    root.isExpanded = false;
    const ids = collectRenderableIds(root);
    assert.ok(ids.includes('/root[1]/@id'));
  });
});
