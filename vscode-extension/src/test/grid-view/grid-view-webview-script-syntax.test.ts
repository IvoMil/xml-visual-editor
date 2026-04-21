// Smoke test: the inline JS body that ships in the grid-view webview is
// assembled as a TypeScript template string, so `tsc` cannot catch JS
// syntax errors inside it. If the script body fails to parse at runtime,
// the webview renders only the static "Grid View loading..." placeholder
// and never wires up `window.addEventListener('message', ...)` — leaving
// the grid permanently blank. This test compiles the emitted script body
// with `vm.compileFunction` (same parser V8 uses for the webview) so any
// regression in the concatenated template is caught at CI time instead
// of user verification.
import * as assert from 'assert';
import * as vm from 'vm';
import { GRID_VIEW_WEBVIEW_SCRIPT } from '../../grid-view/scripts/grid-view-webview-script';

suite('grid-view webview script', () => {
  test('GRID_VIEW_WEBVIEW_SCRIPT parses as valid JavaScript', () => {
    assert.ok(GRID_VIEW_WEBVIEW_SCRIPT.length > 0, 'script body must not be empty');
    assert.doesNotThrow(() => {
      vm.compileFunction(GRID_VIEW_WEBVIEW_SCRIPT, [], {
        filename: 'grid-view-webview-script.js',
      });
    }, 'Inline webview script must be valid JavaScript');
  });
});
