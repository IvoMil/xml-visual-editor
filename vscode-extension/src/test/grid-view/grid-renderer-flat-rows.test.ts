import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { makeNodeData } from './grid-renderer.test-helpers';

suite('GridRenderer — flat rows', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  test('empty model renders "No XML data to display"', () => {
    const model = new GridModel();
    const html = renderer.render(model);
    assert.ok(html.includes('No XML data to display'));
    assert.ok(html.includes('grid-empty'));
  });

  test('single element renders with <> icon and name', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ name: 'config' }), 3);
    const html = renderer.render(model);
    assert.ok(html.includes('&lt;&gt;'), 'Should render <> icon');
    assert.ok(html.includes('config'), 'Should render element name');
    assert.ok(html.includes('element-icon'), 'Should have element-icon class');
  });

  test('element with attributes renders attribute rows with = icon', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        attributes: [
          { name: 'id', value: '42' },
          { name: 'type', value: 'main' },
        ],
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('attribute-icon'), 'Should have attribute-icon class');
    assert.ok(html.includes('attr-name'), 'Should have attr-name class');
    assert.ok(html.includes('id'), 'Should render attribute name "id"');
    assert.ok(html.includes('42'), 'Should render attribute value "42"');
    assert.ok(html.includes('type'), 'Should render attribute name "type"');
    assert.ok(html.includes('main'), 'Should render attribute value "main"');
  });

  test('nested tree renders children as flat rows when parent is expanded', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('child'), 'Should render child element');
    assert.ok(!html.includes('tree-children'), 'Should NOT use nested tree-children container');
    assert.ok(html.includes('g-row'), 'Should use flat g-row structure');
    assert.ok(!html.includes('margin-left'), 'Should not use inline margin-left for indentation');
  });

  test('collapsed node does not render children', () => {
    const model = new GridModel();
    // 4 levels deep so depth-3 node is collapsed with default expandDepth=3
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]',
            name: 'a',
            children: [
              makeNodeData({
                nodeId: '/root[1]/a[1]/b[1]',
                name: 'b',
                children: [
                  makeNodeData({
                    nodeId: '/root[1]/a[1]/b[1]/parent[1]',
                    name: 'parent',
                    children: [
                      makeNodeData({
                        nodeId: '/root[1]/a[1]/b[1]/parent[1]/hidden[1]',
                        name: 'hidden',
                      }),
                    ],
                    childCount: 1,
                  }),
                ],
                childCount: 1,
              }),
            ],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('parent'), 'Collapsed parent should be rendered');
    assert.ok(!html.includes('hidden'), 'Child of collapsed node should not be rendered');
  });

  test('element value shown in node-value span', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ value: 'Hello World' }), 3);
    const html = renderer.render(model);
    assert.ok(html.includes('node-value'), 'Should have node-value class');
    assert.ok(html.includes('Hello World'), 'Should render text content');
  });

  test('no node-value span when value is empty', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ value: '' }), 3);
    const html = renderer.render(model);
    assert.ok(!html.includes('node-value'), 'Should not render node-value for empty value');
  });

  test('data-node-id and data-node-type present on element', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ nodeId: '/config[1]' }), 3);
    const html = renderer.render(model);
    assert.ok(html.includes('data-node-id="/config[1]"'), 'Should have data-node-id');
    assert.ok(html.includes('data-node-type="element"'), 'Should have data-node-type');
  });

  test('data-node-id present on attribute rows', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        nodeId: '/root[1]',
        attributes: [{ name: 'id', value: '1' }],
      }),
     3);
    const html = renderer.render(model);
    assert.ok(
      html.includes('data-node-id="/root[1]/@id"'),
      'Attribute row should have composed data-node-id',
    );
    assert.ok(
      html.includes('data-node-type="attribute"'),
      'Attribute row should have data-node-type',
    );
  });

  test('special characters in names are HTML-escaped', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ name: '<script>&"test"' }), 3);
    const html = renderer.render(model);
    assert.ok(html.includes('&lt;script&gt;&amp;&quot;test&quot;'), 'Name should be HTML-escaped');
    assert.ok(!html.includes('<script>'), 'Raw <script> should not appear');
  });

  test('special characters in values are HTML-escaped', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ value: 'a < b & c > d' }), 3);
    const html = renderer.render(model);
    assert.ok(html.includes('a &lt; b &amp; c &gt; d'), 'Value should be HTML-escaped');
  });

  test('special characters in attribute values are HTML-escaped', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        attributes: [{ name: 'expr', value: 'x < 0 & y > 1' }],
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('x &lt; 0 &amp; y &gt; 1'), 'Attribute value should be HTML-escaped');
  });

  test('expanded node has data-expanded true', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(
      html.includes('data-expanded="true"'),
      'Expanded root should have data-expanded true',
    );
    assert.ok(html.includes('\u25bc'), 'Expanded root should have down triangle');
  });

  test('collapsed node has data-expanded false', () => {
    const model = new GridModel();
    // 4 levels deep so depth-3 node is collapsed with default expandDepth=3
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]',
            name: 'a',
            children: [
              makeNodeData({
                nodeId: '/root[1]/a[1]/b[1]',
                name: 'b',
                children: [
                  makeNodeData({
                    nodeId: '/root[1]/a[1]/b[1]/collapsed[1]',
                    name: 'collapsed',
                    children: [
                      makeNodeData({
                        nodeId: '/root[1]/a[1]/b[1]/collapsed[1]/sub[1]',
                        name: 'sub',
                      }),
                    ],
                    childCount: 1,
                  }),
                ],
                childCount: 1,
              }),
            ],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(
      html.includes('data-expanded="false"'),
      'Collapsed node should have data-expanded false',
    );
    assert.ok(html.includes('\u25b6'), 'Collapsed node should have right triangle');
  });

  test('toggling node changes rendered output from expanded to collapsed', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
        childCount: 1,
      }),
     3);
    const htmlBefore = renderer.render(model);
    assert.ok(htmlBefore.includes('data-expanded="true"'), 'Should start with data-expanded true');
    assert.ok(htmlBefore.includes('\u25bc'), 'Should start with down triangle');
    assert.ok(htmlBefore.includes('child'), 'Should render child when expanded');

    // Toggle the root node to collapse it
    const root = model.getRoot()!;
    root.toggleExpanded();
    const htmlAfter = renderer.render(model);
    assert.ok(
      htmlAfter.includes('data-expanded="false"'),
      'Should have data-expanded false after collapse',
    );
    assert.ok(htmlAfter.includes('\u25b6'), 'Should have right triangle after collapse');
    assert.ok(
      !htmlAfter.includes('data-expanded="true"'),
      'Should not have data-expanded true after collapse',
    );
    assert.ok(
      !htmlAfter.includes('/root[1]/child[1]'),
      'Children should not be rendered when collapsed',
    );
  });

  test('leaf node has expand-spacer instead of toggle', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData(), 3);
    const html = renderer.render(model);
    assert.ok(html.includes('expand-spacer'), 'Leaf should have spacer');
    assert.ok(!html.includes('expand-toggle'), 'Leaf should not have toggle');
  });

  test('sibling numbering shows <N> when siblingCount > 1', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 3,
            siblingIndex: 2,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('sibling-index'), 'Should have sibling-index class');
    assert.ok(html.includes('&lt;2&gt;'), 'Should render <2>');
  });

  test('no sibling numbering when siblingCount is 1', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/item[1]',
            name: 'item',
            siblingCount: 1,
            siblingIndex: 1,
          }),
        ],
        childCount: 1,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(!html.includes('sibling-index'), 'Should NOT have sibling-index class');
  });

  test('count annotation shows (N) on table candidate parent', () => {
    const model = new GridModel();
    const children = Array.from({ length: 5 }, (_, i) =>
      makeNodeData({
        nodeId: `/root[1]/item[${i + 1}]`,
        name: 'item',
        siblingCount: 5,
        siblingIndex: i + 1,
      }),
    );
    model.setTreeData(
      makeNodeData({
        isTableCandidate: true,
        childCount: 5,
        children,
      }),
     3);
    const html = renderer.render(model);
    assert.ok(html.includes('child-count'), 'Should have child-count class');
    assert.ok(html.includes('(5)'), 'Should render (5)');
  });

  test('no count annotation when not table candidate', () => {
    const model = new GridModel();
    model.setTreeData(makeNodeData({ isTableCandidate: false, childCount: 2 }), 3);
    const html = renderer.render(model);
    assert.ok(!html.includes('child-count'), 'Should NOT have child-count class');
  });
});
