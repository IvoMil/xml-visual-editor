import { strict as assert } from 'assert';
import { findEnclosingElementRange } from '../../utils/xml-cursor-parser';

describe('findEnclosingElementRange', () => {
  it('simple element — cursor inside text content', () => {
    const text = '<root><child>text</child></root>';
    const offset = text.indexOf('text');
    const range = findEnclosingElementRange(text, offset);
    assert.ok(range, 'expected a range');
    // Should return the <child>text</child> range
    assert.strictEqual(range.openStart, text.indexOf('<child>'));
    assert.strictEqual(range.closeEnd, text.indexOf('</child>') + '</child>'.length);
  });

  it('self-closing element', () => {
    const text = '<root><empty/></root>';
    const offset = text.indexOf('empty');
    const range = findEnclosingElementRange(text, offset);
    assert.ok(range, 'expected a range');
    assert.strictEqual(range.openStart, text.indexOf('<empty/>'));
    assert.strictEqual(range.closeEnd, text.indexOf('<empty/>') + '<empty/>'.length);
  });

  it('nested same-name — cursor at inner text', () => {
    const text = '<a><a>text</a></a>';
    const offset = text.indexOf('text');
    const range = findEnclosingElementRange(text, offset);
    assert.ok(range, 'expected a range');
    // Should return the inner <a>text</a>
    const innerOpen = text.indexOf('<a>', 1); // skip outermost <a>
    assert.strictEqual(range.openStart, innerOpen);
    assert.strictEqual(range.closeEnd, text.indexOf('</a>') + '</a>'.length);
  });

  it('cursor in opening tag attributes', () => {
    const text = '<root attr="val">content</root>';
    const offset = text.indexOf('attr');
    const range = findEnclosingElementRange(text, offset);
    assert.ok(range, 'expected a range');
    assert.strictEqual(range.openStart, 0);
    assert.strictEqual(range.closeEnd, text.length);
  });

  it('cursor in closing tag', () => {
    const text = '<root>content</root>';
    // Place cursor inside the closing tag name
    const offset = text.indexOf('</root>') + 3; // inside "root" of </root>
    const range = findEnclosingElementRange(text, offset);
    assert.ok(range, 'expected a range');
    assert.strictEqual(range.openStart, 0);
    assert.strictEqual(range.closeEnd, text.length);
  });

  it('root element — cursor in content', () => {
    const text = '<root>hello</root>';
    const offset = text.indexOf('hello');
    const range = findEnclosingElementRange(text, offset);
    assert.ok(range, 'expected a range');
    assert.strictEqual(range.openStart, 0);
    assert.strictEqual(range.closeEnd, text.length);
  });

  it('outside all elements — offset before any tag', () => {
    const text = '   <root></root>';
    const offset = 0; // before any tag
    const range = findEnclosingElementRange(text, offset);
    assert.strictEqual(range, null);
  });
});
