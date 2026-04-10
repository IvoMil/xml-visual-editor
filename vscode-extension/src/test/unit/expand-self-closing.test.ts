import { strict as assert } from 'assert';

// Pure-logic test for the expand-self-closing-tag command.
// Extracts the core algorithm from xml-commands.ts so we can test it
// without VS Code APIs.

function expandSelfClosing(
  text: string,
  offset: number,
): { expanded: string; cursorOffset: number } | null {
  // Scan backward from offset for '<' (not '</' which starts a closing tag).
  let tagStart = -1;
  for (let i = offset; i >= 0; i--) {
    if (text[i] === '<' && (i + 1 >= text.length || text[i + 1] !== '/')) {
      tagStart = i;
      break;
    }
    if (text[i] === '>' && i < offset) {
      break;
    }
  }

  // Cursor might be right after a self-closing tag's '>'
  if (tagStart === -1 && offset >= 2 && text[offset - 1] === '>' && text[offset - 2] === '/') {
    for (let i = offset - 3; i >= 0; i--) {
      if (text[i] === '<') {
        tagStart = i;
        break;
      }
    }
  }

  if (tagStart === -1) return null;

  const selfCloseIdx = text.indexOf('/>', tagStart);
  if (selfCloseIdx === -1) return null;

  const tagEnd = selfCloseIdx + 2;
  const tagText = text.substring(tagStart, tagEnd);
  if (!tagText.startsWith('<') || !tagText.endsWith('/>')) return null;

  const nameMatch = tagText.match(/^<([a-zA-Z_][\w.\-:]*)/);
  if (!nameMatch) return null;

  const tagName = nameMatch[1];
  const beforeSelfClose = tagText.substring(0, tagText.length - 2).trimEnd();
  const expanded =
    text.substring(0, tagStart) + `${beforeSelfClose}></${tagName}>` + text.substring(tagEnd);
  const cursorOffset = tagStart + beforeSelfClose.length + 1;

  return { expanded, cursorOffset };
}

describe('Expand Self-Closing Tag', () => {
  it('expands simple self-closing tag', () => {
    const result = expandSelfClosing('<root><foo/></root>', 7);
    assert.ok(result);
    assert.ok(result.expanded.includes('<foo></foo>'));
  });

  it('expands tag with attributes', () => {
    const result = expandSelfClosing('<root><item id="1" name="test"/></root>', 10);
    assert.ok(result);
    assert.ok(result.expanded.includes('<item id="1" name="test"></item>'));
  });

  it('expands namespaced tag', () => {
    const result = expandSelfClosing('<root><ns:elem attr="v"/></root>', 10);
    assert.ok(result);
    assert.ok(result.expanded.includes('<ns:elem attr="v"></ns:elem>'));
  });

  it('returns null when cursor is not on self-closing tag', () => {
    const result = expandSelfClosing('<root><foo>text</foo></root>', 10);
    assert.strictEqual(result, null);
  });

  it('cursor inside tag name expands correctly', () => {
    const result = expandSelfClosing('<foo/>', 3);
    assert.ok(result);
    assert.strictEqual(result.expanded, '<foo></foo>');
    assert.strictEqual(result.cursorOffset, 5); // between > and </
  });

  it('works when cursor is right after />', () => {
    const result = expandSelfClosing('<foo/>', 6);
    assert.ok(result);
    assert.ok(result.expanded.includes('<foo></foo>'));
  });

  it('handles tag with spaces before />', () => {
    const result = expandSelfClosing('<element  />', 5);
    assert.ok(result);
    assert.ok(result.expanded.includes('<element></element>'));
    // Trailing spaces before /> should be trimmed
    assert.ok(!result.expanded.includes('<element  >'));
  });

  it('returns null for non-self-closing tag', () => {
    const result = expandSelfClosing('<root><child>text</child></root>', 20);
    assert.strictEqual(result, null);
  });
});
