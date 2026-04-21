import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { makeNodeData } from './grid-renderer.test-helpers';

suite('GridRenderer — comment rows', () => {
  let renderer: GridRenderer;

  setup(() => {
    renderer = new GridRenderer();
  });

  suite('Comment rows', () => {
    test('comment child renders r-comment row with <!-- icon and escaped text', () => {
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          children: [
            makeNodeData({
              nodeId: '/root[1]/comment()[1]',
              name: '#comment',
              type: 'comment',
              value: ' hello <world> ',
            }),
          ],
          childCount: 1,
        }),
       3);
      const html = renderer.render(model);
      assert.ok(html.includes('r-comment'), 'Should emit r-comment class');
      assert.ok(html.includes('c-comment-icon'), 'Should emit c-comment-icon cell');
      assert.ok(html.includes('c-comment-text'), 'Should emit c-comment-text cell');
      assert.ok(html.includes('&lt;!--'), 'Icon cell should contain escaped <!-- glyph');
      // Body text must be HTML-escaped, preserving leading/trailing whitespace.
      assert.ok(
        html.includes(' hello &lt;world&gt; '),
        'Comment text must be HTML-escaped and preserve whitespace',
      );
    });

    test('comment row is NOT marked g-editable', () => {
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          children: [
            makeNodeData({
              nodeId: '/root[1]/comment()[1]',
              name: '#comment',
              type: 'comment',
              value: ' c ',
            }),
          ],
          childCount: 1,
        }),
       3);
      const html = renderer.render(model);
      // Isolate the comment row by its r-comment class.
      const start = html.indexOf('r-comment');
      assert.ok(start >= 0, 'Should find comment row');
      const rowEnd = html.indexOf('</div>', start);
      const rowHtml = html.substring(start, rowEnd);
      assert.ok(
        !rowHtml.includes('g-editable'),
        'Comment row must not carry g-editable class',
      );
      assert.ok(
        !rowHtml.includes('expand-toggle'),
        'Comment row must not carry an expand-toggle (leaf, non-expandable)',
      );
    });

    test('comment row carries correct d-{depth} class for its tree depth', () => {
      // root (d=0) -> parent (d=1) -> comment child (d=2)
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          children: [
            makeNodeData({
              nodeId: '/root[1]/parent[1]',
              name: 'parent',
              children: [
                makeNodeData({
                  nodeId: '/root[1]/parent[1]/comment()[1]',
                  name: '#comment',
                  type: 'comment',
                  value: ' nested ',
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
        html.includes('g-row r-comment d-2'),
        'Nested comment should render with d-2 class matching its depth',
      );
    });
  });

  suite('Pre/post-root comments', () => {
    test('preRootComments renders r-comment row BEFORE root name cell', () => {
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          name: 'root',
          preRootComments: [
            {
              nodeId: '/comment()[1]',
              name: '#comment',
              type: 'comment',
              value: 'hi',
              line: 0,
              column: 0,
              childCount: 0,
              isTableCandidate: false,
              siblingIndex: 1,
              siblingCount: 1,
              attributes: [],
              children: [],
            },
          ],
        }),
       3);
      const html = renderer.render(model);
      const commentIdx = html.indexOf('r-comment');
      const rootNameIdx = html.indexOf('>root<');
      assert.ok(commentIdx >= 0, 'Should render an r-comment row');
      assert.ok(rootNameIdx >= 0, 'Should render the root name');
      assert.ok(commentIdx < rootNameIdx, 'Pre-root comment must appear BEFORE root name');
      assert.ok(html.includes('hi'), 'Comment text should appear in output');
    });

    test('postRootComments renders r-comment row AFTER root subtree', () => {
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          name: 'root',
          postRootComments: [
            {
              nodeId: '/comment()[2]',
              name: '#comment',
              type: 'comment',
              value: 'bye',
              line: 0,
              column: 0,
              childCount: 0,
              isTableCandidate: false,
              siblingIndex: 1,
              siblingCount: 1,
              attributes: [],
              children: [],
            },
          ],
        }),
       3);
      const html = renderer.render(model);
      const rootNameIdx = html.indexOf('>root<');
      const commentIdx = html.indexOf('r-comment');
      assert.ok(rootNameIdx >= 0, 'Should render the root name');
      assert.ok(commentIdx >= 0, 'Should render an r-comment row');
      assert.ok(rootNameIdx < commentIdx, 'Post-root comment must appear AFTER root name');
      assert.ok(html.includes('bye'), 'Comment text should appear in output');
    });
  });

  suite('Tree guide (expansion bar)', () => {
    test('indent cells under expanded ancestors carry data-ancestor-expanded="1"', () => {
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          name: 'root',
          children: [makeNodeData({ nodeId: '/root[1]/child[1]', name: 'child' })],
          childCount: 1,
        }),
       3);
      const html = renderer.render(model);
      // The child row at depth 1 has one indent cell at column 1; it must
      // carry the data attribute used by the CSS tree-guide rule. The CSS
      // mechanism uses a `linear-gradient` background (continuous across
      // rows), but the DOM marker is unchanged.
      assert.ok(
        html.includes('class="g-indent" data-ancestor-expanded="1"'),
        'Indent cell of expanded subtree must carry data-ancestor-expanded="1"',
      );
    });
  });

  suite('pre-root comment renders at top-level', () => {
    test('realistic engine shape with name="" and type="comment" renders r-comment row BEFORE root', () => {
      // Mirrors the JSON shape emitted by core/src/jsonrpc/grid_view_handlers.cpp
      // (`GridTreeNodeToJson`) for the sample file RunErlauf1BEnsemble.xml which
      // starts with `<!--FEWS Donau--><Parameters ...>`. Goes through the same
      // GridModel.setTreeData → GridRenderer.render path the panel uses.
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          nodeId: '/Parameters[1]',
          name: 'Parameters',
          childCount: 0,
          preRootComments: [
            {
              nodeId: '/#comment[1]',
              name: '', // engine BuildCommentNode leaves name default-constructed
              type: 'comment',
              value: 'FEWS Donau',
              line: 1,
              column: 0,
              childCount: 0,
              isTableCandidate: false,
              siblingIndex: 1,
              siblingCount: 1,
              attributes: [],
              children: [],
            },
          ],
        }),
       3);
      const html = renderer.render(model);
      const commentIdx = html.indexOf('r-comment');
      const rootNameIdx = html.indexOf('>Parameters<');
      assert.ok(commentIdx >= 0, 'Pre-root comment should render an r-comment row');
      assert.ok(rootNameIdx >= 0, 'Root element name "Parameters" should be rendered');
      assert.ok(commentIdx < rootNameIdx, 'r-comment row MUST appear before the root c-name cell');
      assert.ok(html.includes('FEWS Donau'), 'Comment body "FEWS Donau" should appear in output');
    });
  });

  suite('comment inside a table row is NOT a data column', () => {
    test('<t> with two <row> children (one carrying a comment) renders comment as r-comment, not as table cell', () => {
      // Mirrors resources/sample_files/test_gridview.xml:
      //   <t>
      //     <row><!-- some comment2 --> <x>x1</x> <y>y1</y></row>
      //     <row> <x>x2</x> <y>y2</y></row>
      //   </t>
      const model = new GridModel();
      model.setTreeData(
        makeNodeData({
          nodeId: '/t[1]',
          name: 't',
          isTableCandidate: true,
          childCount: 2,
          children: [
            makeNodeData({
              nodeId: '/t[1]/row[1]', name: 'row', siblingIndex: 1, siblingCount: 2,
              childCount: 2,
              children: [
                makeNodeData({
                  nodeId: '/t[1]/row[1]/#comment[1]', name: '', type: 'comment',
                  value: ' some comment2 ',
                }),
                makeNodeData({ nodeId: '/t[1]/row[1]/x[1]', name: 'x', value: 'x1' }),
                makeNodeData({ nodeId: '/t[1]/row[1]/y[1]', name: 'y', value: 'y1' }),
              ],
            }),
            makeNodeData({
              nodeId: '/t[1]/row[2]', name: 'row', siblingIndex: 2, siblingCount: 2,
              childCount: 2,
              children: [
                makeNodeData({ nodeId: '/t[1]/row[2]/x[1]', name: 'x', value: 'x2' }),
                makeNodeData({ nodeId: '/t[1]/row[2]/y[1]', name: 'y', value: 'y2' }),
              ],
            }),
          ],
        }),
       3);
      const firstRow = model.findNode('/t[1]/row[1]');
      assert.ok(firstRow, 'Test setup: first row must be locatable');
      firstRow!.isExpanded = true;
      const html = renderer.render(model);

      // (a) Table header has exactly the `#`, `x`, `y` columns — no
      //     empty-name column synthesized from the comment child.
      //     The elem-col-header markers contain "<> <name>"; assert both
      //     x and y are present, and no empty-name header exists.
      assert.ok(html.includes('elem-col-header') && html.includes('&gt; x'),
        'Table header should include an x element column');
      assert.ok(html.includes('&gt; y'),
        'Table header should include a y element column');
      // Empty-name header would render as `<> ` followed by nothing; its
      // tell-tale is an elem-col-header span that ends immediately after
      // the "&gt; " prefix.
      assert.ok(!/elem-col-header[^>]*>&lt;&gt; <\/span>/.test(html),
        'Table header MUST NOT synthesize an empty-name column for the comment');

      // (b) No data cell contains "some comment2" — the comment must not
      //     be routed into any `t-cell` / `.g-editable` data cell.
      const tCellMatches = html.match(/<span class="t-cell[^"]*"[^>]*>[^<]*some comment2[^<]*<\/span>/g);
      assert.ok(!tCellMatches, 'Comment text must not appear in any t-cell data cell');

      // (c) A r-comment row carrying the comment body exists in the output
      //     (emitted between the table header and row #1's data).
      assert.ok(html.includes('r-comment'), 'An r-comment row should be emitted for the in-row comment');
      assert.ok(html.includes('some comment2'), 'Comment body should appear in the r-comment row');
    });
  });

  suite('Selection highlight — selected comment rows retain their highlight class after grid reconcile', () => {
    test('grid-css.ts defines a .r-comment.selected rule using --grid-selection-bg', async () => {
      // The rule must target the comment-specific cell classes
      // (.c-comment-icon / .c-comment-text) because those cells do NOT
      // receive a background from the generic `.g-row.selected > .c-name,
      // …` rule set. Without this, Shift+Click including a comment row
      // produced no visible highlight (user-reported regression).
      const mod = await import('../../grid-view/styles/grid-css');
      const css = mod.GRID_STATIC_CSS;
      assert.ok(
        /\.g-row\.r-comment\.selected\s*>\s*\.c-comment-icon/.test(css),
        'CSS must target .g-row.r-comment.selected > .c-comment-icon',
      );
      assert.ok(
        /\.g-row\.r-comment\.selected\s*>\s*\.c-comment-text/.test(css),
        'CSS must target .g-row.r-comment.selected > .c-comment-text',
      );
      // The selection rule must reuse the same background token as the
      // generic selection highlight.
      const match = css.match(
        /\.g-row\.r-comment\.selected[^}]*\{[^}]*background-color:\s*var\(--grid-selection-bg\)/,
      );
      assert.ok(match, 'Selected comment rows must use var(--grid-selection-bg)');
    });
  });
});
