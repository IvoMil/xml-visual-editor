import { strict as assert } from 'assert';
import { findEnclosingTag } from '../../utils/xml-cursor-helpers';

describe('xml-cursor-helpers - findEnclosingTag regressions', () => {
  it('returns null when cursor is between > and </ (boundary)', () => {
    const text = '<variable></variable>';
    // offset at the '<' of the closing tag
    const offset = 10;
    const res = findEnclosingTag(text, offset);
    assert.strictEqual(res, null);
  });

  it('detects inside closing tag (isClose = true)', () => {
    const text = '<variable></variab';
    // somewhere inside the partial closing tag name
    const offset = 15;
    const res = findEnclosingTag(text, offset);
    assert.ok(res, 'expected a TagBounds result');
    assert.strictEqual(res.isClose, true);
    assert.ok(res.inner.includes('variab'));
  });

  it('detects inside opening tag (isClose = false)', () => {
    const text = '<variable></variable>';
    const offset = 5; // inside the opening tag name
    const res = findEnclosingTag(text, offset);
    assert.ok(res, 'expected a TagBounds result');
    assert.strictEqual(res.isClose, false);
    assert.ok(res.inner.includes('variable'));
  });

  it('returns null at very start (offset=0)', () => {
    const text = '<a></a>';
    const res = findEnclosingTag(text, 0);
    assert.strictEqual(res, null);
  });

  it('finds tag when cursor inside simple tag', () => {
    const text = '<tag>';
    const res = findEnclosingTag(text, 1);
    assert.ok(res, 'expected a TagBounds result');
    assert.strictEqual(res.isClose, false);
    assert.strictEqual(res.inner, 'tag');
  });

  // Note: the editor insertion-position fix relies on findEnclosingTag treating
  // the gap before a closing tag as outside any tag. The above tests cover
  // that boundary behaviour.
});
