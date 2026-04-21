// Bug D / Bug E — per-run toggle scope.
//
// When a parent element contains TWO contiguous same-name runs with
// different group names (e.g. <alpha>×3 immediately followed by
// <beta>×2), each run must own its own toggle key so that flipping
// one run or turning its table-mode OFF does not affect the other.
//
// The per-run key is `${firstMember.nodeId}#group`; the first run's
// firstMember is `<alpha[1]>`, the second run's is `<beta[1]>`.

import * as assert from 'node:assert';
import { GridModel } from '../../grid-view/model/grid-model';
import { GridRenderer } from '../../grid-view/view/grid-renderer';
import { createToggleState } from '../../grid-view/model/toggle-state';
import { makeNodeData } from './grid-renderer.test-helpers';

const PARENT = '/root[1]/multiRun[1]';

function buildTwoRunModel(): GridModel {
  const model = new GridModel();
  const mk = (tag: string, idx: number, total: number) =>
    makeNodeData({
      nodeId: `${PARENT}/${tag}[${idx}]`,
      name: tag,
      siblingIndex: idx,
      siblingCount: total,
      attributes: [{ name: 'k', value: `${tag}${idx}` }],
      children: [
        makeNodeData({
          nodeId: `${PARENT}/${tag}[${idx}]/v[1]`,
          name: 'v',
          value: `${idx}`,
        }),
      ],
    });
  model.setTreeData(
    makeNodeData({
      nodeId: '/root[1]',
      name: 'root',
      childCount: 1,
      children: [
        makeNodeData({
          nodeId: PARENT,
          name: 'multiRun',
          isTableCandidate: true,
          childCount: 5,
          children: [
            mk('alpha', 1, 3),
            mk('alpha', 2, 3),
            mk('alpha', 3, 3),
            mk('beta', 1, 2),
            mk('beta', 2, 2),
          ],
        }),
      ],
    }),
    3,
  );
  model.findNode('/root[1]')!.isExpanded = true;
  model.findNode(PARENT)!.isExpanded = true;
  // Each run's table region is gated on the first member's expansion
  // state (used as the group-expansion proxy by the renderer).
  model.findNode(`${PARENT}/alpha[1]`)!.isExpanded = true;
  model.findNode(`${PARENT}/beta[1]`)!.isExpanded = true;
  return model;
}

suite('Grid multi-run toggle scope (Bug D / Bug E)', () => {
  test('each run emits its own toggle icon keyed on `${firstMember.nodeId}#group`', () => {
    const renderer = new GridRenderer();
    const html = renderer.render(buildTwoRunModel());
    const alphaKey = `${PARENT}/alpha[1]#group`;
    const betaKey = `${PARENT}/beta[1]#group`;
    assert.ok(
      html.includes(`data-toggle-target="${alphaKey}"`),
      `expected a toggle target keyed to the alpha run: ${alphaKey}`,
    );
    assert.ok(
      html.includes(`data-toggle-target="${betaKey}"`),
      `expected a toggle target keyed to the beta run: ${betaKey}`,
    );
    // Neither run falls back onto the parent-level key.
    assert.ok(
      !html.includes(`data-toggle-target="${PARENT}"`),
      'must not fall back to the parent nodeId for either run toggle target',
    );
  });

  test('flipping only the alpha run leaves the beta run in default (unflipped) layout', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    const alphaKey = `${PARENT}/alpha[1]#group`;
    ts.setFlipped(alphaKey, true);
    renderer.setToggleState(ts);
    const html = renderer.render(buildTwoRunModel());

    // Alpha region is flipped → contains at least one `r-flipped` row
    // whose flip-corner cell references the alpha key.
    const alphaCornerRe = new RegExp(
      `<[^>]*data-toggle-target="${alphaKey.replace(/[./[\]]/g, (c) => `\\${c}`)}"[^>]*>`,
    );
    assert.ok(alphaCornerRe.test(html));
    // Beta run must NOT produce a .r-flipped header.
    // Find the offset where the beta group icon lives and confirm the
    // surrounding header row lacks `r-flipped`.
    const betaKey = `${PARENT}/beta[1]#group`;
    const betaIdx = html.indexOf(`data-toggle-target="${betaKey}"`);
    assert.ok(betaIdx >= 0);
    const betaRowStart = html.lastIndexOf('<div class="g-row', betaIdx);
    const betaRowEnd = html.indexOf('</div>', betaIdx);
    const betaRowHtml = html.substring(betaRowStart, betaRowEnd);
    assert.ok(
      !/\br-flipped\b/.test(betaRowHtml),
      `beta run header must NOT be flipped when only alpha was flipped: ${betaRowHtml}`,
    );
  });

  test('turning table-mode OFF only on the alpha run leaves the beta run as a table', () => {
    const renderer = new GridRenderer();
    const ts = createToggleState();
    const alphaKey = `${PARENT}/alpha[1]#group`;
    ts.setTableMode(alphaKey, false);
    renderer.setToggleState(ts);
    const html = renderer.render(buildTwoRunModel());

    // Beta run still renders as a table: its header row carries
    // `t-header`. The alpha run has no table header (rendered as tree
    // ladder) — so exactly the beta header must exist.
    const betaFirstMember = `${PARENT}/beta[1]`;
    // Look for a t-header row whose subtree references beta[1].
    const tableHeaderRe = /<div class="[^"]*\bt-header\b[^"]*"[^>]*>[\s\S]*?<\/div>/g;
    let sawBetaHeader = false;
    let sawAlphaHeader = false;
    let m = tableHeaderRe.exec(html);
    while (m !== null) {
      if (m[0].includes(`${PARENT}/beta[1]`) || m[0].includes(`${PARENT}/beta[1]#group`)) {
        sawBetaHeader = true;
      }
      if (m[0].includes(`${PARENT}/alpha[1]#group`)) {
        sawAlphaHeader = true;
      }
      m = tableHeaderRe.exec(html);
    }
    assert.ok(sawBetaHeader, 'beta run must still emit a t-header');
    assert.ok(
      !sawAlphaHeader,
      'alpha run table-mode=OFF must suppress its t-header',
    );
    // Existence sanity check of beta content.
    assert.ok(html.includes(betaFirstMember));
  });
});
