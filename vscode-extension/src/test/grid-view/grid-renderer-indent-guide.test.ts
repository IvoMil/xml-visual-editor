import { strict as assert } from 'assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { GRID_STATIC_CSS } from '../../grid-view/styles/grid-css';
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

// Build a 3-level-deep tree so .g-indent[data-ancestor-expanded="1"]
// cells are emitted at depths 1 and 2.
function makeDeepTree(): GridTreeNodeData {
  return makeNodeData({
    nodeId: '/root[1]',
    name: 'root',
    children: [
      makeNodeData({
        nodeId: '/root[1]/a[1]',
        name: 'a',
        children: [
          makeNodeData({
            nodeId: '/root[1]/a[1]/b[1]',
            name: 'b',
            children: [
              makeNodeData({ nodeId: '/root[1]/a[1]/b[1]/c[1]', name: 'c' }),
            ],
            childCount: 1,
          }),
        ],
        childCount: 1,
      }),
    ],
    childCount: 1,
  });
}

suite('GridRenderer — indent guide bar', () => {
  // ── 1. Renderer emits indent cells with ancestor-expanded marker ─────

  test('emits data-ancestor-expanded="1" on indent cells for nested rows', () => {
    const renderer = new GridRenderer();
    const model = new GridModel();
    model.setTreeData(makeDeepTree(), 3);
    // GridNode auto-expands on construction when it has renderable
    // content, so nested descendants are visible by default.
    const html = renderer.render(model);
    const matches = html.match(/class="g-indent"[^>]*data-ancestor-expanded="1"/g) || [];
    assert.ok(
      matches.length >= 2,
      `Expected at least 2 ancestor-expanded indent cells, got ${matches.length}`,
    );
  });

  // ── 2. CSS uses the VS Code indent-guide token ───────────────────────

  test('CSS references --vscode-tree-indentGuidesStroke token', () => {
    assert.ok(
      GRID_STATIC_CSS.includes('--vscode-tree-indentGuidesStroke'),
      'GRID_STATIC_CSS should reference --vscode-tree-indentGuidesStroke',
    );
  });

  // ── 3. Old faint 0.4 alpha fallback is replaced ──────────────────────

  test('CSS no longer uses the faint rgba(127,127,127,0.4) fallback', () => {
    assert.ok(
      !GRID_STATIC_CSS.includes('rgba(127,127,127,0.4)'),
      'Old hairline fallback rgba(127,127,127,0.4) must be gone',
    );
  });

  // ── 4. Gradient is defined on ancestor-expanded indent cells ─────────

  test('CSS defines background-image gradient for expanded ancestor indent cells', () => {
    // Single-line regex: anchor on the selector, then require a
    // linear-gradient background-image before the closing brace.
    const rule = GRID_STATIC_CSS.match(
      /\.g-indent\[data-ancestor-expanded="1"\]\s*\{[^}]*background-image\s*:\s*linear-gradient[^}]*\}/,
    );
    assert.ok(
      rule,
      '.g-indent[data-ancestor-expanded="1"] should set a linear-gradient background-image',
    );
  });

  // ── 5. Selection rule must not wipe the gradient ─────────────────────
  //
  // The L67 rule `.g-row.selected > .g-indent { background-color: ...; }`
  // only sets background-color, so the background-image (gradient)
  // survives. Guard against a regression that adds `background-image:
  // none` or collapses to the `background:` shorthand.

  test('selection rule for .g-indent does not clobber background-image', () => {
    const selectionRule = GRID_STATIC_CSS.match(
      /\.g-row\.selected\s*>\s*\.g-indent\s*\{[^}]*\}/,
    );
    assert.ok(selectionRule, 'Expected a .g-row.selected > .g-indent rule');
    const body = selectionRule![0];
    assert.ok(
      !/background-image\s*:\s*none/i.test(body),
      'Selection rule must not set background-image: none',
    );
    // Must NOT use the `background:` shorthand (which would reset image).
    assert.ok(
      !/(^|[;{\s])background\s*:/.test(body),
      'Selection rule must use background-color, not the `background:` shorthand',
    );
  });

  // ── 6. row-gap: 0 preserved on .grid-root ─────────────────────────────

  test('.grid-root preserves row-gap: 0 for continuous guide', () => {
    const rootRule = GRID_STATIC_CSS.match(/\.grid-root\s*\{[^}]*\}/);
    assert.ok(rootRule, 'Expected a .grid-root rule');
    assert.ok(
      /row-gap\s*:\s*0\b/.test(rootRule![0]),
      '.grid-root must keep row-gap: 0',
    );
  });

  // ── 7. .g-indent must not get a bottom border (keeps guide continuous)

  test('.g-cell/.t-cell/.t-rowid get border-bottom, .g-indent does not', () => {
    // The shared row-separator rule must enumerate g-cell, t-cell, t-rowid
    // — but NOT .g-indent.
    const borderRule = GRID_STATIC_CSS.match(
      /\.g-cell[^{]*,[^{]*\.t-cell[^{]*,[^{]*\.t-rowid[^{]*\{\s*border-bottom\s*:[^}]*\}/,
    );
    assert.ok(borderRule, 'Expected the shared border-bottom rule for cells');
    assert.ok(
      !/\.g-indent/.test(borderRule![0]),
      '.g-indent must be excluded from the border-bottom selector list',
    );
  });

  // ── 8. Chevron is centred on the indent-guide stripe ─────────────────
  //
  // The guide is drawn at x=9→11 (centre x=10) of the 20px indent
  // track. A parent's chevron sits in its name cell, which shares the
  // same grid column as descendants' indent cells. For the guide to
  // visibly run through the chevron centre, we need:
  //   .c-name padding-left  + .expand-toggle width / 2  ==  guide centre
  //      3px                 +      14px / 2            ==  10px ✓
  // Lock in both values so future CSS tweaks can't silently drift.

  test('chevron centre aligns with indent-guide centre (10px)', () => {
    const nameRule = GRID_STATIC_CSS.match(
      /\.g-row\s*>\s*\.c-name\s*\{[^}]*\}/,
    );
    assert.ok(nameRule, 'Expected a .g-row > .c-name rule');
    const paddingMatch = nameRule![0].match(/padding-left\s*:\s*(\d+)px/);
    assert.ok(paddingMatch, '.c-name must declare padding-left in px');
    const paddingLeft = Number(paddingMatch![1]);

    const toggleRule = GRID_STATIC_CSS.match(/\.expand-toggle\s*\{[^}]*\}/);
    assert.ok(toggleRule, 'Expected an .expand-toggle rule');
    const widthMatch = toggleRule![0].match(/width\s*:\s*(\d+)px/);
    assert.ok(widthMatch, '.expand-toggle must declare width in px');
    const toggleWidth = Number(widthMatch![1]);

    const chevronCentre = paddingLeft + toggleWidth / 2;
    assert.equal(
      chevronCentre,
      10,
      `Chevron centre should be 10px (guide centre); got ${chevronCentre} (padding-left=${paddingLeft}, toggle width=${toggleWidth})`,
    );
  });
});
