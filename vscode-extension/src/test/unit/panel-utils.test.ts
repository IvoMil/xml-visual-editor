import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { getPanelFontCss, stripJsoncComments } from '../../shared/panel-utils';

describe('getPanelFontCss', () => {
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

  beforeEach(() => {
    originalGetConfiguration = vscode.workspace.getConfiguration;
  });

  afterEach(() => {
    vscode.workspace.getConfiguration = originalGetConfiguration;
  });

  function mockConfiguration(overrides: Record<string, unknown>): void {
    vscode.workspace.getConfiguration = (() => ({
      get: (key: string, defaultValue?: unknown) => {
        return key in overrides ? overrides[key] : defaultValue;
      },
    })) as any;
  }

  it('returns empty string when fontSize=0 and fontFamily is empty', () => {
    mockConfiguration({ 'panels.fontSize': 0, 'panels.fontFamily': '' });
    assert.strictEqual(getPanelFontCss(), '');
  });

  it('returns font-size CSS when fontSize > 0', () => {
    mockConfiguration({ 'panels.fontSize': 14, 'panels.fontFamily': '' });
    const css = getPanelFontCss();
    assert.ok(css.includes('font-size: 14px'), `Expected font-size CSS, got: ${css}`);
    assert.ok(!css.includes('font-family'), 'Should not include font-family');
  });

  it('returns font-family CSS when fontFamily is set', () => {
    mockConfiguration({ 'panels.fontSize': 0, 'panels.fontFamily': 'Consolas' });
    const css = getPanelFontCss();
    assert.ok(css.includes('font-family: Consolas'), `Expected font-family CSS, got: ${css}`);
    assert.ok(!css.includes('font-size'), 'Should not include font-size');
  });

  it('returns both CSS rules when both are set', () => {
    mockConfiguration({ 'panels.fontSize': 16, 'panels.fontFamily': 'Consolas' });
    const css = getPanelFontCss();
    assert.ok(css.includes('font-size: 16px'), `Expected font-size CSS, got: ${css}`);
    assert.ok(css.includes('font-family: Consolas'), `Expected font-family CSS, got: ${css}`);
  });

  it('uses default values when config returns undefined', () => {
    mockConfiguration({});
    const css = getPanelFontCss();
    assert.strictEqual(css, '', 'Should return empty with default values');
  });
});

describe('stripJsoncComments', () => {
  it('strips single-line comments', () => {
    const input = '{\n  "key": "val" // this is a comment\n}';
    const result = stripJsoncComments(input);
    assert.ok(
      !result.includes('// this is a comment'),
      `Comment should be stripped, got: ${result}`,
    );
    assert.ok(result.includes('"key": "val"'), `JSON structure should remain, got: ${result}`);
  });

  it('strips block comments', () => {
    const input = '{\n  /* block */\n  "key": "val"\n}';
    const result = stripJsoncComments(input);
    assert.ok(!result.includes('/* block */'), `Block comment should be stripped, got: ${result}`);
    assert.ok(result.includes('"key": "val"'), `JSON structure should remain, got: ${result}`);
  });

  it('preserves URLs inside string values', () => {
    const input = '{\n  "$schema": "vscode://schemas/color-theme",\n  "name": "My Theme"\n}';
    const result = stripJsoncComments(input);
    assert.ok(
      result.includes('"vscode://schemas/color-theme"'),
      `URL should be preserved, got: ${result}`,
    );
  });

  it('preserves http:// URLs inside strings', () => {
    const input = '{"url": "http://example.com/path"}';
    const result = stripJsoncComments(input);
    assert.ok(
      result.includes('"http://example.com/path"'),
      `HTTP URL should be preserved, got: ${result}`,
    );
  });

  it('handles escaped quotes in strings', () => {
    const input = '{"key": "value with \\"quotes\\" and // inside"}';
    const result = stripJsoncComments(input);
    assert.ok(
      result.includes('// inside'),
      `// inside string after escaped quotes should be preserved, got: ${result}`,
    );
  });

  it('strips BOM', () => {
    const input = '\uFEFF{"key": "val"}';
    const result = stripJsoncComments(input);
    assert.ok(
      result.startsWith('{'),
      `BOM should be stripped, got charCode: ${result.charCodeAt(0)}`,
    );
  });

  it('handles empty input', () => {
    assert.strictEqual(stripJsoncComments(''), '');
  });

  it('handles input with only comments', () => {
    const input = '// just a comment\n{"key": "val"}';
    const result = stripJsoncComments(input);
    assert.ok(!result.includes('just a comment'), `Comment should be stripped, got: ${result}`);
    assert.ok(result.includes('"key": "val"'), `JSON should remain, got: ${result}`);
  });
});
