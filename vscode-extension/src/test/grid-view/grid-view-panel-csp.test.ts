import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Regression guard: the webview CSP must allow element-level `style="..."` attributes.
 *
 * The grid renderer emits inline styles for per-row depth (`style="--depth: N"`) and for
 * per-table-region column tracks (`style="grid-template-columns: ..."`). These are NOT
 * covered by the nonced `<style>` block — nonces only apply to `<style>` elements, not
 * to element style attributes. Element-level inline styles require `'unsafe-inline'` in
 * the CSP `style-src` directive.
 *
 * Without this, the browser silently drops every `style="..."` attribute, causing:
 *   - all rows to render at depth 0 (no tree indentation)
 *   - table regions to collapse into a single-column vertical stack
 *
 * This bug is invisible to string-based renderer tests (which see the attributes in the
 * output HTML) but breaks the rendered view completely.
 */
suite('GridViewPanel — CSP regression guard', () => {
  test('webview CSP style-src includes unsafe-inline for element style attributes', () => {
    // __dirname points into the compiled `out/test/grid-view/` tree at runtime.
    // The source file lives at <repo>/vscode-extension/src/grid-view/grid-view-panel.ts.
    const panelPath = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'grid-view',
      'grid-view-panel.ts',
    );
    const source = fs.readFileSync(panelPath, 'utf8');

    const cspLine = source
      .split('\n')
      .find((l) => l.includes('Content-Security-Policy') || l.includes('style-src'));
    assert.ok(cspLine, 'Could not locate CSP meta content in grid-view-panel.ts');

    // Either the line itself or the adjacent line must contain the style-src with 'unsafe-inline'
    const cspBlock = source.substring(
      Math.max(0, source.indexOf('Content-Security-Policy') - 50),
      source.indexOf('Content-Security-Policy') + 400,
    );

    assert.ok(
      /style-src[^;]*'unsafe-inline'/.test(cspBlock),
      "CSP style-src must include 'unsafe-inline' so element-level style=\"...\" attributes " +
        "(used by grid renderer for --depth and grid-template-columns) are not blocked.",
    );
  });
});
