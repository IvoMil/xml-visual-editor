import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { makeNodeData } from './grid-renderer.test-helpers';

suite('GridRenderer — table regions', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  test('table region renders sub-grid for repeated children', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 1,
            childCount: 1,
            children: [
              makeNodeData({ nodeId: '/root[1]/item[1]/val[1]', name: 'val', value: 'A' }),
            ],
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
            childCount: 1,
            children: [
              makeNodeData({ nodeId: '/root[1]/item[2]/val[1]', name: 'val', value: 'B' }),
            ],
          }),
        ],
      }),
     3);
    // Table groups start collapsed; expand first node to show the table
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    assert.ok(!html.includes('t-region'), 'Should NOT have t-region (multi-column grid)');
    assert.ok(html.includes('t-header'), 'Should have t-header row');
    assert.ok(html.includes('t-rowid'), 'Should have t-rowid cell');
    assert.ok(html.includes('elem-col-header'), 'Should have elem-col-header');
    assert.ok(html.includes('r-trow'), 'Should have r-trow data rows');
    assert.ok(html.includes('A'), 'Should contain cell value A');
    assert.ok(html.includes('B'), 'Should contain cell value B');
  });

  test('table header shows attribute columns with = prefix', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 1,
            attributes: [{ name: 'id', value: '1' }],
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
            attributes: [{ name: 'id', value: '2' }],
          }),
        ],
      }),
     3);
    // Table groups start collapsed; expand first node to show the table
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    assert.ok(html.includes('attr-col-header'), 'Should have attr-col-header');
    assert.ok(html.includes('= id'), 'Should render = id');
  });

  test('unique children in table candidate parent render as tree nodes', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 3,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 1,
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
          }),
          makeNodeData({
            nodeId: '/root[1]/config[1]',
            name: 'config',
            siblingCount: 1,
            siblingIndex: 1,
          }),
        ],
      }),
     3);
    // Table groups start collapsed; expand first node to show the table
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    // config should render as tree-node
    assert.ok(html.includes('data-node-id="/root[1]/config[1]"'), 'config should be rendered');
    // items should be rendered as table rows
    assert.ok(html.includes('r-trow'), 'items should be in a table region');
  });

  test('table region label shows group name and count', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 2,
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 1,
          }),
          makeNodeData({
            nodeId: '/root[1]/item[2]',
            name: 'item',
            siblingCount: 2,
            siblingIndex: 2,
          }),
        ],
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('r-tregion-label'), 'Should have r-tregion-label row');
    assert.ok(html.includes('(2)'), 'Should show count (2)');
  });

  suite('Split table regions (Round B contiguous-run)', () => {
    test('comment between same-name elements splits into TWO table regions', () => {
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          name: 'p',
          isTableCandidate: true,
          childCount: 6,
          children: [
            makeNodeData({
              nodeId: '/p[1]/a[1]', name: 'a', siblingIndex: 1, siblingCount: 3,
              attributes: [{ name: 'c', value: '1' }],
            }),
            makeNodeData({
              nodeId: '/p[1]/a[2]', name: 'a', siblingIndex: 2, siblingCount: 3,
              attributes: [{ name: 'c', value: '2' }],
            }),
            makeNodeData({
              nodeId: '/p[1]/a[3]', name: 'a', siblingIndex: 3, siblingCount: 3,
              attributes: [{ name: 'c', value: '3' }],
            }),
            makeNodeData({
              nodeId: '/p[1]/comment()[1]', name: '#comment', type: 'comment',
              value: 'mid',
            }),
            makeNodeData({
              nodeId: '/p[1]/a[4]', name: 'a', siblingIndex: 1, siblingCount: 2,
              attributes: [{ name: 'c', value: '4' }],
            }),
            makeNodeData({
              nodeId: '/p[1]/a[5]', name: 'a', siblingIndex: 2, siblingCount: 2,
              attributes: [{ name: 'c', value: '5' }],
            }),
          ],
        }),
       3);
      const html = renderer.render(model);
      // Two separate r-tregion-label rows for the same name 'a'.
      let count = 0;
      let i = 0;
      while ((i = html.indexOf('r-tregion-label', i)) !== -1) {
        count++;
        i += 'r-tregion-label'.length;
      }
      assert.equal(count, 2, 'Expected exactly TWO table region labels for split runs');
      // Comment row must sit BETWEEN the two labels.
      const firstLabel = html.indexOf('r-tregion-label');
      const secondLabel = html.indexOf('r-tregion-label', firstLabel + 1);
      const commentIdx = html.indexOf('r-comment');
      assert.ok(commentIdx > firstLabel && commentIdx < secondLabel,
        'Comment row must appear between the two table-region labels');
      // Both labels show the (N) count for their respective runs.
      assert.ok(html.indexOf('(3)') >= 0, 'First run label should show (3)');
      assert.ok(html.indexOf('(2)') >= 0, 'Second run label should show (2)');
    });

    test('uninterrupted same-name run produces ONE table region (regression)', () => {
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          name: 'p',
          isTableCandidate: true,
          childCount: 2,
          children: [
            makeNodeData({
              nodeId: '/p[1]/a[1]', name: 'a', siblingIndex: 1, siblingCount: 2,
              attributes: [{ name: 'c', value: '1' }],
            }),
            makeNodeData({
              nodeId: '/p[1]/a[2]', name: 'a', siblingIndex: 2, siblingCount: 2,
              attributes: [{ name: 'c', value: '2' }],
            }),
          ],
        }),
       3);
      const html = renderer.render(model);
      let count = 0;
      let i = 0;
      while ((i = html.indexOf('r-tregion-label', i)) !== -1) {
        count++;
        i += 'r-tregion-label'.length;
      }
      assert.equal(count, 1, 'Expected exactly ONE table region label for uninterrupted run');
    });
  });
});
