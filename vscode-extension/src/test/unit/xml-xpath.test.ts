import { strict as assert } from 'assert';
import { getElementAtCursor } from '../../utils/xml-cursor-parser';

describe('XPath computation via getElementAtCursor', () => {
  // ─── Simple XPath (no predicates) ──────────────────────────────────────

  describe('simpleXPath', () => {
    it('root element → /root', () => {
      const xml = '<root>text</root>';
      const offset = 6; // inside text content
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.simpleXPath, '/root');
    });

    it('nested element → /root/parent/child', () => {
      const xml = '<root><parent><child>text</child></parent></root>';
      const offset = 21; // inside <child> text
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.simpleXPath, '/root/parent/child');
    });

    it('deep nesting (4+ levels) → /a/b/c/d', () => {
      const xml = '<a><b><c><d>deep</d></c></b></a>';
      const offset = 12; // inside <d> text
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.simpleXPath, '/a/b/c/d');
    });
  });

  // ─── XPath with predicates ─────────────────────────────────────────────

  describe('xpathWithPredicates', () => {
    it('single elements all index 1 → /root[1]/parent[1]/child[1]', () => {
      const xml = '<root><parent><child>text</child></parent></root>';
      const offset = 21; // inside <child> text
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.xpathWithPredicates, '/root[1]/parent[1]/child[1]');
    });

    it('second same-name sibling → /root[1]/items[1]/item[2]', () => {
      const xml = '<root><items><item>a</item><item>b</item></items></root>';
      const offset = 33; // inside second <item> text "b"
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.xpathWithPredicates, '/root[1]/items[1]/item[2]');
    });

    it('third same-name sibling → /root[1]/items[1]/item[3]', () => {
      const xml = '<root><items><item>a</item><item>b</item><item>c</item></items></root>';
      const offset = 47; // inside third <item> text "c"
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.xpathWithPredicates, '/root[1]/items[1]/item[3]');
    });

    it('mixed: some index 1, some higher', () => {
      const xml = '<root><a>x</a><a><b>y</b></a></root>';
      //           0    5    10   15   20   25   30
      const offset = 20; // inside <b> text "y" under second <a>
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.xpathWithPredicates, '/root[1]/a[2]/b[1]');
    });
  });

  // ─── Context-specific XPath ────────────────────────────────────────────

  describe('context-specific XPath', () => {
    it('Context A (in tag name): XPath includes the element', () => {
      const xml = '<root><element>text</element></root>';
      const offset = 10; // cursor in "elem|ent" of opening tag
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.cursorContext, 'A');
      assert.strictEqual(info.simpleXPath, '/root/element');
      assert.strictEqual(info.xpathWithPredicates, '/root[1]/element[1]');
    });

    it('Context E (empty element): cursor between open/close tags', () => {
      const xml = '<root><empty></empty></root>';
      const offset = 13; // between <empty> and </empty>
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.cursorContext, 'E');
      assert.strictEqual(info.simpleXPath, '/root/empty');
      assert.strictEqual(info.xpathWithPredicates, '/root[1]/empty[1]');
    });

    it('Context F (between children): returns parent XPath', () => {
      const xml = '<root><a>x</a><b>y</b></root>';
      const offset = 14; // between </a> and <b>
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.cursorContext, 'F');
      assert.strictEqual(info.simpleXPath, '/root');
      assert.strictEqual(info.xpathWithPredicates, '/root[1]');
    });

    it('Context I (outside root): empty XPath strings', () => {
      const xml = '<root></root>';
      const offset = 13; // after </root>
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.cursorContext, 'I');
      assert.strictEqual(info.simpleXPath, '');
      assert.strictEqual(info.xpathWithPredicates, '');
    });
  });

  // ─── Self-closing tags ─────────────────────────────────────────────────

  describe('self-closing tags', () => {
    it('cursor after self-closing <item/> → parent XPath (context F)', () => {
      const xml = '<root><item/><other>text</other></root>';
      const offset = 13; // right after <item/>
      const info = getElementAtCursor(xml, offset);
      // After a self-closing tag the cursor is between children (context F)
      assert.strictEqual(info.cursorContext, 'F');
      assert.strictEqual(info.simpleXPath, '/root');
      assert.strictEqual(info.xpathWithPredicates, '/root[1]');
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('empty document → both XPaths are empty strings', () => {
      const xml = '';
      const offset = 0;
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.simpleXPath, '');
      assert.strictEqual(info.xpathWithPredicates, '');
    });

    it('single root element only → /root and /root[1]', () => {
      const xml = '<root></root>';
      const offset = 6; // between <root> and </root>
      const info = getElementAtCursor(xml, offset);
      assert.strictEqual(info.simpleXPath, '/root');
      assert.strictEqual(info.xpathWithPredicates, '/root[1]');
    });
  });
});
