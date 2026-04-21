import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { createToggleState } from '../../grid-view/model/toggle-state';
import { makeNodeData } from './grid-renderer.test-helpers';

/**
 * B.1.d — flipped (transposed) table rendering.
 * Refs: docs/designs/DESIGN_GRID_ALIGNMENT.md §9.0 Q4, Q5.
 */

suite('emit-table-region — flipped (transposed) table rendering', () => {
  test('F1. flipped hybrid table still emits chevrons keyed on child nodeId', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);

    const model = new GridModel();
    function item(idx: number) {
      const itemId = `/r[1]/g[1]/it[${idx}]`;
      return makeNodeData({
        nodeId: itemId,
        name: 'it',
        siblingIndex: idx,
        siblingCount: 2,
        isHybridTableCandidate: true,
        attributes: [{ name: 'id', value: `x${idx}` }],
        children: [
          makeNodeData({
            nodeId: `${itemId}/sub[1]`,
            name: 'sub',
            attributes: [{ name: 'k', value: `v${idx}` }],
          }),
        ],
      });
    }
    model.setTreeData(
      makeNodeData({
        nodeId: '/r[1]',
        name: 'r',
        children: [
          makeNodeData({
            nodeId: '/r[1]/g[1]',
            name: 'g',
            isTableCandidate: true,
            children: [item(1), item(2)],
          }),
        ],
      }),
      3,
    );
    model.findNode('/r[1]')!.isExpanded = true;
    model.findNode('/r[1]/g[1]')!.isExpanded = true;
    model.findNode('/r[1]/g[1]/it[1]')!.isExpanded = true;
    ts.setFlipped('/r[1]/g[1]', true);

    const html = renderer.render(model);
    // Chevron cells for each of the two rows' `sub` children must exist.
    assert.ok(
      html.includes('data-node-id="/r[1]/g[1]/it[1]/sub[1]"'),
      'chevron for row1/sub[1] present',
    );
    assert.ok(
      html.includes('data-node-id="/r[1]/g[1]/it[2]/sub[1]"'),
      'chevron for row2/sub[1] present',
    );
    // Two chevron cells in the flipped "sub" row.
    const chevCount = (html.match(/expand-toggle cell-toggle/g) ?? []).length;
    assert.strictEqual(chevCount, 2, 'two chevron cells in flipped meta row');
  });

  test('F2. flipped scalar-only table transposes attribute/elem columns', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);

    const model = new GridModel();
    function leaf(idx: number) {
      return makeNodeData({
        nodeId: `/r[1]/x[${idx}]`,
        name: 'x',
        siblingIndex: idx,
        siblingCount: 2,
        value: `val${idx}`,
      });
    }
    model.setTreeData(
      makeNodeData({
        nodeId: '/r[1]',
        name: 'r',
        isTableCandidate: true,
        children: [leaf(1), leaf(2)],
      }),
      3,
    );
    model.findNode('/r[1]')!.isExpanded = true;
    model.findNode('/r[1]/x[1]')!.isExpanded = true;
    ts.setFlipped('/r[1]', true);

    const html = renderer.render(model);
    assert.ok(html.includes('r-flipped'), 'r-flipped marker present in scalar flip');
    // Synthesised "(value)" column becomes a single flipped data row.
    assert.ok(
      html.includes('data-flip-col-name="(value)"'),
      'synthesised (value) col rendered as a flipped data row',
    );
    // Both row values appear as cells in that row.
    assert.ok(html.includes('val1') && html.includes('val2'));
  });

  test('F3. flipped view preserves grid-column placement (every cell has grid-column inline style)', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    renderer.setToggleState(ts);

    const model = new GridModel();
    model.setTreeData(
      makeNodeData({
        nodeId: '/r[1]',
        name: 'r',
        children: [
          makeNodeData({
            nodeId: '/r[1]/g[1]',
            name: 'g',
            isTableCandidate: true,
            children: [
              makeNodeData({
                nodeId: '/r[1]/g[1]/x[1]',
                name: 'x',
                siblingIndex: 1,
                siblingCount: 2,
                isHybridTableCandidate: true,
                attributes: [{ name: 'a', value: '1' }],
              }),
              makeNodeData({
                nodeId: '/r[1]/g[1]/x[2]',
                name: 'x',
                siblingIndex: 2,
                siblingCount: 2,
                isHybridTableCandidate: true,
                attributes: [{ name: 'a', value: '2' }],
              }),
            ],
          }),
        ],
      }),
      3,
    );
    model.findNode('/r[1]')!.isExpanded = true;
    model.findNode('/r[1]/g[1]')!.isExpanded = true;
    model.findNode('/r[1]/g[1]/x[1]')!.isExpanded = true;
    ts.setFlipped('/r[1]/g[1]', true);

    const html = renderer.render(model);
    // Every .t-cell in the flipped region must carry a grid-column style.
    const flippedSection = html.substring(html.indexOf('r-flipped'));
    const cells = flippedSection.match(/<span class="t-cell[^"]*"[^>]*>/g) ?? [];
    assert.ok(cells.length >= 3, 'at least 3 t-cells in flipped section');
    for (const cell of cells) {
      assert.ok(
        /grid-column: \d+ \/ (\d+|-1)/.test(cell),
        `every t-cell must have grid-column style; got: ${cell}`,
      );
    }
  });
});
