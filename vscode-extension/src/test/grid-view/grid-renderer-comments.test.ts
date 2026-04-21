import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { GridTreeNodeData } from '../../grid-view/grid-view-types';

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

/** Round B.2 — XML comment pseudo-rows rendered by the grid renderer. */
suite('GridRenderer — XML comment rows', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  test('renders element / comment / element siblings in document order', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({ nodeId: '/root[1]/a[1]', name: 'a' }),
          makeNodeData({
            nodeId: '/root[1]/#comment[1]',
            name: '',
            type: 'comment',
            value: 'hi',
          }),
          makeNodeData({ nodeId: '/root[1]/b[1]', name: 'b' }),
        ],
        childCount: 3,
      }),
     3);
    const html = renderer.render(model);

    const idxA = html.indexOf('data-node-id="/root[1]/a[1]"');
    const idxComment = html.indexOf('r-comment');
    const idxB = html.indexOf('data-node-id="/root[1]/b[1]"');
    assert.ok(idxA >= 0, 'element "a" row rendered');
    assert.ok(idxComment >= 0, 'comment row rendered with r-comment class');
    assert.ok(idxB >= 0, 'element "b" row rendered');
    assert.ok(
      idxA < idxComment && idxComment < idxB,
      `expected order a < comment < b but got ${idxA}, ${idxComment}, ${idxB}`,
    );
    // Comment text appears inside the dedicated text cell.
    const commentRowMatch = html.match(/<div class="g-row r-comment[^"]*"[^>]*>[^<]*(?:<[^>]+>[^<]*)*hi/);
    assert.ok(commentRowMatch, 'comment text "hi" appears inside the comment row');
    // Italic styling comes via .c-comment-text class (styled in grid-view-panel.ts).
    assert.ok(html.includes('c-comment-text'), 'comment row has c-comment-text styling class');
  });

  test('comment row has no editable cells, no chevron, no expand toggle', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/#comment[1]',
            name: '',
            type: 'comment',
            value: 'note',
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    const start = html.indexOf('<div class="g-row r-comment');
    assert.ok(start >= 0, 'comment row present');
    const end = html.indexOf('</div>', start);
    assert.ok(end > start, 'comment row has closing tag');
    const rowHtml = html.slice(start, end);
    assert.ok(!rowHtml.includes('g-editable'), 'no .g-editable cell in comment row');
    assert.ok(!rowHtml.includes('expand-toggle'), 'no chevron/expand-toggle in comment row');
    assert.ok(!rowHtml.includes('expand-spacer'), 'no expand-spacer either');
  });

  test('comment row shares indent-chain depth with its sibling elements', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        nodeId: '/root[1]',
        name: 'root',
        children: [
          makeNodeData({
            nodeId: '/root[1]/branch[1]',
            name: 'branch',
            children: [
              makeNodeData({
                nodeId: '/root[1]/branch[1]/leaf[1]',
                name: 'leaf',
              }),
              makeNodeData({
                nodeId: '/root[1]/branch[1]/#comment[1]',
                name: '',
                type: 'comment',
                value: 'inside',
              }),
            ],
            childCount: 2,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);

    // Locate the leaf row and the comment row, count indent cells in each.
    const leafStart = html.indexOf('data-node-id="/root[1]/branch[1]/leaf[1]"');
    const leafRowStart = html.lastIndexOf('<div class="g-row', leafStart);
    const leafRowEnd = html.indexOf('</div>', leafStart);
    const leafRowHtml = html.slice(leafRowStart, leafRowEnd);

    const commentStart = html.indexOf('<div class="g-row r-comment');
    const commentEnd = html.indexOf('</div>', commentStart);
    const commentRowHtml = html.slice(commentStart, commentEnd);

    const leafIndentCount = (leafRowHtml.match(/class="g-indent"/g) || []).length;
    const commentIndentCount = (commentRowHtml.match(/class="g-indent"/g) || []).length;

    assert.strictEqual(
      commentIndentCount,
      leafIndentCount,
      `comment indent count (${commentIndentCount}) should match sibling leaf (${leafIndentCount})`,
    );
    assert.ok(leafIndentCount >= 2, 'leaf at depth >= 2 should have at least 2 indent cells');
    // Both rows should also carry the same d-N depth class.
    const depthRe = /d-(\d+)/;
    const leafDepth = leafRowHtml.match(depthRe)![1];
    const commentDepth = commentRowHtml.match(depthRe)![1];
    assert.strictEqual(commentDepth, leafDepth, 'comment row d-N matches sibling leaf d-N');
  });
});
