import * as assert from 'assert';
import { AttributesPanelProvider } from '../../panels/attributes-panel';

suite('AttributesPanelProvider', () => {
  function createProvider(): AttributesPanelProvider {
    return new AttributesPanelProvider(
      { isReady: () => false, sendRequest: () => ({}) } as any,
      async () => {},
    );
  }

  test('CSS contains focused-attr contrast fix for .attr-type and .attr-doc', () => {
    const provider = createProvider();
    const html: string = (provider as any).getWebviewHtml();
    assert.ok(
      html.includes('tr.focused-attr .attr-type'),
      'CSS should contain tr.focused-attr .attr-type rule',
    );
    assert.ok(
      html.includes('tr.focused-attr .attr-doc'),
      'CSS should contain tr.focused-attr .attr-doc rule',
    );
    // Verify the foreground color override is present
    const ruleMatch = html.match(
      /tr\.focused-attr\s+\.attr-type[\s\S]*?tr\.focused-attr\s+\.attr-doc\s*\{[^}]*color:/,
    );
    assert.ok(ruleMatch, 'focused-attr .attr-type/.attr-doc rule should set a color override');
  });
});
