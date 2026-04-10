import { strict as assert } from 'assert';
import { getStyles } from '../../shared/schema-table-styles';

describe('getStyles', () => {
  const css = getStyles();

  it('element style uses xve-tag-color CSS variable', () => {
    // .nt-element should use var(--xve-tag-color, ...) instead of vscode-symbolIcon-fieldForeground
    assert.ok(
      css.includes('var(--xve-tag-color'),
      'CSS should contain var(--xve-tag-color for .nt-element',
    );
    assert.ok(
      !css.includes('.nt-element') ||
        !css.match(/\.nt-element[^{]*\{[^}]*symbolIcon-fieldForeground/),
      '.nt-element should NOT use symbolIcon-fieldForeground',
    );
  });

  it('compositor styles use description foreground', () => {
    // .nt-choice, .nt-sequence, .nt-all should all use descriptionForeground
    const choiceMatch = css.match(/\.nt-choice\s*\{[^}]*\}/);
    assert.ok(choiceMatch, '.nt-choice rule should exist');
    assert.ok(
      choiceMatch[0].includes('var(--vscode-descriptionForeground'),
      `.nt-choice should use descriptionForeground, got: ${choiceMatch[0]}`,
    );

    const seqMatch = css.match(/\.nt-sequence\s*\{[^}]*\}/);
    assert.ok(seqMatch, '.nt-sequence rule should exist');
    assert.ok(
      seqMatch[0].includes('var(--vscode-descriptionForeground'),
      `.nt-sequence should use descriptionForeground, got: ${seqMatch[0]}`,
    );

    const allMatch = css.match(/\.nt-all\s*\{[^}]*\}/);
    assert.ok(allMatch, '.nt-all rule should exist');
    assert.ok(
      allMatch[0].includes('var(--vscode-descriptionForeground'),
      `.nt-all should use descriptionForeground, got: ${allMatch[0]}`,
    );
  });

  it('CSS uses dynamic tag color from :root, not hardcoded theme overrides', () => {
    // :root should set --xve-tag-color with the default fallback
    assert.ok(
      css.includes('--xve-tag-color: #569CD6'),
      'CSS :root should set --xve-tag-color with default blue',
    );
    // body.vscode-dark/light overrides should NOT exist (they break dynamic theming)
    assert.ok(
      !css.includes('body.vscode-dark'),
      'CSS should NOT include body.vscode-dark override',
    );
    assert.ok(
      !css.includes('body.vscode-light'),
      'CSS should NOT include body.vscode-light override',
    );
  });

  it('CSS applies custom tag color when provided', () => {
    const custom = getStyles({ tagColor: '#F92672', attrColor: '#A6E22E' });
    assert.ok(custom.includes('--xve-tag-color: #F92672'), 'CSS should use provided tagColor');
    assert.ok(custom.includes('--xve-attr-color: #A6E22E'), 'CSS should use provided attrColor');
  });
});
