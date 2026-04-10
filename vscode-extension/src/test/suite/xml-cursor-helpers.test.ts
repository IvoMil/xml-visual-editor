import { strict as assert } from 'assert';
import { stripXmlComments } from '../../utils/xml-cursor-helpers';

suite('stripXmlComments', () => {
  test('returns text unchanged when no comments present', () => {
    const text = '<root><child>text</child></root>';
    assert.strictEqual(stripXmlComments(text), text);
  });

  test('replaces single comment with spaces preserving length', () => {
    const text = '<root><!-- a comment --><child/></root>';
    const result = stripXmlComments(text);
    assert.strictEqual(result.length, text.length, 'length must be preserved');
    assert.ok(!result.includes('<!--'), 'comment start marker should be gone');
    assert.ok(!result.includes('-->'), 'comment end marker should be gone');
    // Tags outside the comment must survive
    assert.ok(result.includes('<root>'));
    assert.ok(result.includes('<child/>'));
    assert.ok(result.includes('</root>'));
  });

  test('replaces multiple comments with spaces', () => {
    const text = '<!-- c1 --><root><!-- c2 --></root>';
    const result = stripXmlComments(text);
    assert.strictEqual(result.length, text.length);
    assert.ok(!result.includes('<!--'));
    assert.ok(result.includes('<root>'));
    assert.ok(result.includes('</root>'));
  });

  test('handles nested angle brackets in comments', () => {
    const text = '<root><!-- <foo attr="v"> --><child/></root>';
    const result = stripXmlComments(text);
    assert.strictEqual(result.length, text.length);
    assert.ok(!result.includes('<foo'), 'tag inside comment must be blanked');
    assert.ok(result.includes('<child/>'), 'tag outside comment must survive');
  });

  test('handles empty comments', () => {
    const text = '<root><!----><child/></root>';
    const result = stripXmlComments(text);
    assert.strictEqual(result.length, text.length);
    assert.ok(!result.includes('<!--'));
    assert.ok(result.includes('<child/>'));
  });
});
