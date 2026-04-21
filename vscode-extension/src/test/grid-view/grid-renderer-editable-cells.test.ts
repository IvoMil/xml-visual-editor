import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { makeNodeData } from './grid-renderer.test-helpers';

suite('GridRenderer — editable cells', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  function countOccurrences(haystack: string, needle: string): number {
    let n = 0;
    let i = 0;
    while ((i = haystack.indexOf(needle, i)) !== -1) {
      n++;
      i += needle.length;
    }
    return n;
  }

  test('attribute value cell has g-editable; name/indent/# do not', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        attributes: [{ name: 'id', value: '42' }],
      }),
     3);
    const html = renderer.render(model);
    // Attribute value cell is a c-value with g-editable.
    assert.ok(
      html.includes('c-value g-editable'),
      'Attribute value cell should carry g-editable class',
    );
    // Name cells, indent cells, and the (non-existent here) rowid are
    // structural and must NOT carry g-editable.
    assert.ok(
      !html.includes('c-name g-editable'),
      'Name cells must NOT have g-editable',
    );
    assert.ok(
      !html.includes('g-indent g-editable') &&
        !html.includes('g-editable g-indent'),
      'Indent cells must NOT have g-editable',
    );
  });

  test('table data cells have g-editable; rowid and headers do not', () => {
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
    model.findNode('/root[1]/item[1]')!.toggleExpanded();
    const html = renderer.render(model);
    // Two data rows × one attr column = 2 editable t-cells.
    assert.ok(
      countOccurrences(html, 't-cell g-editable') >= 2,
      'Table data cells should carry g-editable',
    );
    // The # row-id cell and the t-th header cells must NOT.
    assert.ok(
      !html.includes('t-rowid g-editable') &&
        !html.includes('g-editable t-rowid'),
      'Row-id (#) cell must NOT have g-editable',
    );
    assert.ok(
      !html.includes('t-th g-editable') && !html.includes('g-editable t-th'),
      'Header (t-th) cells must NOT have g-editable',
    );
  });

  test('collapsed (N) summary value cell is NOT editable', () => {
    // Element with attributes only (no children, no text) -> when
    // collapsed, the value cell shows an XMLSpy-style mixed-summary
    // which is structural, not an editable field.
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        name: 'host',
        attributes: [{ name: 'bar', value: 'x' }],
        children: [
          makeNodeData({
            nodeId: '/root[1]/leaf[1]',
            name: 'leaf',
            attributes: [{ name: 'k', value: 'v' }],
          }),
        ],
      }),
     3);
    // Collapse the leaf so its value cell becomes a mixed-summary.
    const leaf = model.findNode('/root[1]/leaf[1]')!;
    if (leaf.isExpanded) leaf.toggleExpanded();
    const html = renderer.render(model);
    assert.ok(html.includes('mixed-summary'), 'Expected mixed-summary rendering');
    // The row that contains the mixed-summary must NOT have a
    // `c-value g-editable` cell. Match only the collapsed leaf row.
    const rowStart = html.indexOf('data-node-id="/root[1]/leaf[1]"');
    assert.ok(rowStart >= 0, 'Should find leaf row');
    const rowEnd = html.indexOf('</div>', rowStart);
    const rowHtml = html.slice(rowStart, rowEnd);
    assert.ok(
      rowHtml.includes('mixed-summary'),
      'Leaf row should contain the mixed-summary',
    );
    assert.ok(
      !rowHtml.includes('c-value g-editable'),
      'Collapsed summary value cell must NOT be g-editable',
    );
  });

  test('leaf element value cell has g-editable', () => {
    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        children: [
          makeNodeData({
            nodeId: '/root[1]/leaf[1]',
            name: 'leaf',
            value: 'hello',
          }),
        ],
      }),
     3);
    const html = renderer.render(model);
    assert.ok(
      html.includes('c-value g-editable'),
      'Leaf element value cell should carry g-editable',
    );
  });
});
