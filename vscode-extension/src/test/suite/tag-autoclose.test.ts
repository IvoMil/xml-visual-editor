import { strict as assert } from 'assert';
import { extractTagNameForAutoClose } from '../../services/tag-autoclose';

suite('TagAutoClose - extractTagNameForAutoClose', () => {
  // --- Positive cases ---

  test('returns tag name for simple opening tag', () => {
    const text = '<test>';
    assert.strictEqual(extractTagNameForAutoClose(text, 5, ''), 'test');
  });

  test('returns tag name for tag with attributes', () => {
    const text = '<elem attr="val">';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'elem');
  });

  test('returns tag name for namespaced tag', () => {
    const text = '<ns:elem>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'ns:elem');
  });

  test('returns tag name for tag with multiple attributes', () => {
    const text = '<input type="text" name="field" required="true">';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'input');
  });

  test('returns tag name for tag with single-quoted attributes', () => {
    const text = "<tag attr='value'>";
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'tag');
  });

  test('returns tag name for tag with newlines in attributes', () => {
    const text = '<elem\n  attr="val"\n  other="x">';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'elem');
  });

  test('returns tag name when no matching close tag on line after cursor', () => {
    const text = '<test>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, 'some text'), 'test');
  });

  test('handles tag with > inside quoted attribute value', () => {
    const text = '<tag attr="val>test">';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'tag');
  });

  test('returns tag name for tag preceded by other content', () => {
    const text = 'prefix text <div>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'div');
  });

  test('returns tag name for underscore-prefixed tag', () => {
    const text = '<_custom>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), '_custom');
  });

  test('returns tag name for tag with dots and hyphens', () => {
    const text = '<my-custom.tag>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), 'my-custom.tag');
  });

  // --- Self-closing tags ---

  test('returns null for self-closing tag />', () => {
    const text = '<br/>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  test('returns null for self-closing tag with space before />', () => {
    const text = '<br />';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  // --- Comments ---

  test('returns null for comment end -->', () => {
    const text = '<!-- comment -->';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  // --- CDATA ---

  test('returns null for CDATA end ]]>', () => {
    const text = '<![CDATA[data]]>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  // --- Processing instructions ---

  test('returns null for processing instruction ?>', () => {
    const text = '<?xml version="1.0"?>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  // --- Closing tags ---

  test('returns null for closing tag </...>', () => {
    const text = '</test>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  // --- DOCTYPE ---

  test('returns null for DOCTYPE declaration', () => {
    const text = '<!DOCTYPE html>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  // --- Duplicate close tag on same line ---

  test('returns null when matching close tag exists after cursor on same line', () => {
    const text = '<test>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, '</test>rest'), null);
  });

  test('returns tag name when different close tag exists after cursor', () => {
    const text = '<test>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, '</other>'), 'test');
  });

  // --- Edge / boundary cases ---

  test('returns null for empty text', () => {
    assert.strictEqual(extractTagNameForAutoClose('', -1, ''), null);
  });

  test('returns null when gtOffset is 0 (no room for tag name)', () => {
    assert.strictEqual(extractTagNameForAutoClose('>', 0, ''), null);
  });

  test('returns null when gtOffset is out of bounds (negative)', () => {
    assert.strictEqual(extractTagNameForAutoClose('<test>', -1, ''), null);
  });

  test('returns null when gtOffset exceeds text length', () => {
    assert.strictEqual(extractTagNameForAutoClose('<a>', 100, ''), null);
  });

  test('returns null when character at gtOffset is not >', () => {
    const text = '<test>';
    assert.strictEqual(extractTagNameForAutoClose(text, 2, ''), null);
  });

  test('returns null when no < is found scanning backward', () => {
    const text = 'no open bracket>';
    // The > is at index 15, but there's no < before it
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  test('returns null for stray > with another > before it', () => {
    // Scan backward encounters another > → returns null
    const text = '<a>>>';
    assert.strictEqual(extractTagNameForAutoClose(text, 4, ''), null);
  });

  test('returns null for tag with invalid name (starts with digit)', () => {
    const text = '<1invalid>';
    assert.strictEqual(extractTagNameForAutoClose(text, text.length - 1, ''), null);
  });

  test('returns tag for minimal single-char tag name', () => {
    const text = '<a>';
    assert.strictEqual(extractTagNameForAutoClose(text, 2, ''), 'a');
  });
});
