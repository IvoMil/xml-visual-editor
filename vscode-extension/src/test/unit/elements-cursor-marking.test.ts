import { strict as assert } from 'assert';
import {
  markCursorPosition,
  markCursorPositionInBranch,
  computeFocusedChild,
} from '../../panels/elements-panel';
import { ContentModelNode } from '../../shared/schema-table-renderer';

function makeNode(overrides: Partial<ContentModelNode> & { name: string }): ContentModelNode {
  return {
    node_type: 'element',
    min_occurs: 1,
    max_occurs: 1,
    current_count: 0,
    is_satisfied: false,
    is_exhausted: false,
    can_insert: true,
    type_name: '',
    documentation: '',
    children: [],
    ...overrides,
  } as ContentModelNode;
}

function makeCompositor(
  overrides: Partial<ContentModelNode> & { children: ContentModelNode[] },
): ContentModelNode {
  return {
    node_type: 'compositor',
    name: null,
    min_occurs: 1,
    max_occurs: 1,
    current_count: 0,
    is_satisfied: false,
    is_exhausted: false,
    can_insert: false,
    type_name: '',
    documentation: '',
    ...overrides,
  } as ContentModelNode;
}

describe('markCursorPositionInBranch', () => {
  it('flat array: elements before sibling get before_cursor, sibling gets before_cursor + cursor_adjacent, after stays unmarked', () => {
    const a = makeNode({ name: 'a' });
    const b = makeNode({ name: 'b', can_insert: true });
    const c = makeNode({ name: 'c' });
    const children = [a, b, c];

    markCursorPositionInBranch(children, 'b');

    assert.strictEqual(a.before_cursor, true, 'a should be before_cursor');
    assert.strictEqual(b.before_cursor, true, 'b (sibling) should be before_cursor');
    assert.strictEqual(b.cursor_adjacent, true, 'b should be cursor_adjacent (can_insert=true)');
    assert.strictEqual(c.before_cursor, undefined, 'c should NOT be before_cursor');
  });

  it('flat array: sibling with can_insert=false does NOT get cursor_adjacent', () => {
    const a = makeNode({ name: 'a' });
    const b = makeNode({ name: 'b', can_insert: false });
    const c = makeNode({ name: 'c' });
    const children = [a, b, c];

    markCursorPositionInBranch(children, 'b');

    assert.strictEqual(b.before_cursor, true);
    assert.strictEqual(b.cursor_adjacent, undefined, 'b should NOT be cursor_adjacent');
  });

  it('nested compositor: recurses into compositor containing the sibling', () => {
    const x = makeNode({ name: 'x' });
    const y = makeNode({ name: 'y', can_insert: true });
    const z = makeNode({ name: 'z' });
    const seq = makeCompositor({ children: [x, y, z] });

    const before = makeNode({ name: 'before' });
    const after = makeNode({ name: 'after' });
    const children = [before, seq, after];

    markCursorPositionInBranch(children, 'y');

    // 'before' is before the compositor containing y â†’ before_cursor
    assert.strictEqual(before.before_cursor, true);
    // compositor itself is marked before_cursor
    assert.strictEqual(seq.before_cursor, true);
    // inside compositor: x before y â†’ before_cursor
    assert.strictEqual(x.before_cursor, true);
    // y is the sibling
    assert.strictEqual(y.before_cursor, true);
    assert.strictEqual(y.cursor_adjacent, true);
    // z is after y inside compositor â†’ NOT before_cursor
    assert.strictEqual(z.before_cursor, undefined);
    // after is after compositor â†’ NOT before_cursor
    assert.strictEqual(after.before_cursor, undefined);
  });

  it('sibling not found: all children get before_cursor', () => {
    const a = makeNode({ name: 'a' });
    const b = makeNode({ name: 'b' });
    const c = makeNode({ name: 'c' });
    const children = [a, b, c];

    markCursorPositionInBranch(children, 'nonexistent');

    assert.strictEqual(a.before_cursor, true);
    assert.strictEqual(b.before_cursor, true);
    assert.strictEqual(c.before_cursor, true);
  });

  it('first element is the sibling: no elements before, sibling marked, rest unmarked', () => {
    const a = makeNode({ name: 'a', can_insert: true });
    const b = makeNode({ name: 'b' });
    const children = [a, b];

    markCursorPositionInBranch(children, 'a');

    assert.strictEqual(a.before_cursor, true);
    assert.strictEqual(a.cursor_adjacent, true);
    assert.strictEqual(b.before_cursor, undefined);
  });

  it('last element is the sibling: all marked before_cursor', () => {
    const a = makeNode({ name: 'a' });
    const b = makeNode({ name: 'b' });
    const c = makeNode({ name: 'c', can_insert: true });
    const children = [a, b, c];

    markCursorPositionInBranch(children, 'c');

    assert.strictEqual(a.before_cursor, true);
    assert.strictEqual(b.before_cursor, true);
    assert.strictEqual(c.before_cursor, true);
    assert.strictEqual(c.cursor_adjacent, true);
  });
});

describe('markCursorPosition - exhausted compositor handling', () => {
  it('exhausted choice with direct element children: marks sibling, elements after NOT before_cursor', () => {
    const alpha = makeNode({
      name: 'alpha',
      can_insert: false,
      current_count: 1,
      is_exhausted: true,
      is_satisfied: true,
    });
    const beta = makeNode({
      name: 'beta',
      can_insert: false,
      current_count: 0,
    });
    const gamma = makeNode({
      name: 'gamma',
      can_insert: false,
      current_count: 0,
    });

    const exhaustedChoice = makeCompositor({
      children: [alpha, beta, gamma],
      can_insert: false,
      is_exhausted: true,
      is_satisfied: true,
      current_count: 1,
    });

    const afterElement = makeNode({ name: 'after', can_insert: true });
    const model = [exhaustedChoice, afterElement];

    markCursorPosition(model, 'alpha');

    // exhaustedChoice is before_cursor (it contains the sibling)
    assert.strictEqual(exhaustedChoice.before_cursor, true);
    // alpha (direct element sibling) gets before_cursor
    assert.strictEqual(alpha.before_cursor, true);
    // beta and gamma are after alpha inside the exhausted choice â†’ NOT before_cursor
    assert.strictEqual(
      beta.before_cursor,
      undefined,
      'beta after sibling should NOT be before_cursor',
    );
    assert.strictEqual(
      gamma.before_cursor,
      undefined,
      'gamma after sibling should NOT be before_cursor',
    );
    // afterElement is after the compositor â†’ NOT before_cursor
    assert.strictEqual(afterElement.before_cursor, undefined);
  });

  it('exhausted choice containing sequence(a, b, c) where b is sibling: a before_cursor, b before_cursor, c NOT', () => {
    const a = makeNode({ name: 'a', can_insert: false, current_count: 1, is_satisfied: true });
    const b = makeNode({ name: 'b', can_insert: false, current_count: 1, is_satisfied: true });
    const c = makeNode({ name: 'c', can_insert: true, current_count: 0 });

    const innerSeq = makeCompositor({ children: [a, b, c] });

    const exhaustedChoice = makeCompositor({
      children: [innerSeq],
      can_insert: false,
      is_exhausted: true,
      is_satisfied: true,
      current_count: 1,
    });

    const model = [exhaustedChoice];

    markCursorPosition(model, 'b');

    assert.strictEqual(exhaustedChoice.before_cursor, true);
    assert.strictEqual(innerSeq.before_cursor, true);
    // a is before b â†’ before_cursor
    assert.strictEqual(a.before_cursor, true);
    // b is the sibling â†’ before_cursor
    assert.strictEqual(b.before_cursor, true);
    // c is after b â†’ NOT before_cursor
    assert.strictEqual(c.before_cursor, undefined, 'c after sibling should NOT be before_cursor');
  });

  it('exhausted compositor: sibling with can_insert=true gets cursor_adjacent', () => {
    const elem = makeNode({
      name: 'elem',
      can_insert: true,
      current_count: 1,
      is_satisfied: true,
    });
    const other = makeNode({ name: 'other', can_insert: false, current_count: 0 });

    const exhaustedComp = makeCompositor({
      children: [elem, other],
      can_insert: false,
      is_exhausted: true,
      current_count: 1,
    });

    const model = [exhaustedComp];

    markCursorPosition(model, 'elem');

    assert.strictEqual(elem.before_cursor, true);
    assert.strictEqual(elem.cursor_adjacent, true);
    assert.strictEqual(other.before_cursor, undefined);
  });

  it('exhausted compositor: sibling with can_insert=false does NOT get cursor_adjacent', () => {
    const elem = makeNode({
      name: 'elem',
      can_insert: false,
      current_count: 1,
      is_satisfied: true,
      is_exhausted: true,
    });
    const other = makeNode({ name: 'other', can_insert: true, current_count: 0 });

    const exhaustedComp = makeCompositor({
      children: [elem, other],
      can_insert: false,
      is_exhausted: true,
      current_count: 1,
    });

    const model = [exhaustedComp];

    markCursorPosition(model, 'elem');

    assert.strictEqual(elem.before_cursor, true);
    assert.strictEqual(elem.cursor_adjacent, undefined);
  });
});

describe('computeFocusedChild - exhausted compositor active branch', () => {
  it('exhausted choice with element after choice: focus finds element in active branch', () => {
    // computeFocusedChild now recurses into exhausted compositors to find
    // non-before_cursor elements in the active branch.
    const a = makeNode({
      name: 'a',
      can_insert: false,
      current_count: 1,
      is_satisfied: true,
      is_exhausted: true,
    });
    const b = makeNode({
      name: 'b',
      can_insert: true,
      current_count: 0,
      is_satisfied: false,
    });
    const c = makeNode({
      name: 'c',
      can_insert: true,
      current_count: 0,
      is_satisfied: false,
    });

    const innerSeq = makeCompositor({ children: [a, b, c] });

    const exhaustedChoice = makeCompositor({
      children: [innerSeq],
      can_insert: false,
      is_exhausted: true,
      is_satisfied: true,
      current_count: 1,
    });

    const afterChoice = makeNode({
      name: 'afterChoice',
      can_insert: true,
      current_count: 0,
    });

    const model = [exhaustedChoice, afterChoice];

    markCursorPosition(model, 'a');
    const focused = computeFocusedChild(model, 'a', 'F');

    // Focus finds 'b' — first non-before_cursor element inside the active branch.
    assert.strictEqual(focused, 'b');
  });

  it('exhausted choice with elements after sibling in branch: focus finds them', () => {
    const a = makeNode({
      name: 'a',
      can_insert: false,
      current_count: 1,
      is_satisfied: true,
      is_exhausted: true,
    });
    const b = makeNode({
      name: 'b',
      can_insert: false,
      current_count: 1,
      is_satisfied: true,
      is_exhausted: true,
    });
    const c = makeNode({
      name: 'c',
      can_insert: true,
      current_count: 0,
      is_satisfied: false,
    });

    const innerSeq = makeCompositor({ children: [a, b, c] });

    const exhaustedChoice = makeCompositor({
      children: [innerSeq],
      can_insert: false,
      is_exhausted: true,
      is_satisfied: true,
      current_count: 1,
    });

    const model = [exhaustedChoice];

    markCursorPosition(model, 'b');
    const focused = computeFocusedChild(model, 'b', 'F');

    // 'c' is the first non-before_cursor element inside the active branch
    assert.strictEqual(focused, 'c');
  });

  it('exhausted choice with all branch elements exhausted: focuses element after choice', () => {
    const a = makeNode({
      name: 'a',
      can_insert: false,
      current_count: 1,
      is_satisfied: true,
      is_exhausted: true,
    });
    const b = makeNode({
      name: 'b',
      can_insert: false,
      current_count: 1,
      is_satisfied: true,
      is_exhausted: true,
    });

    const innerSeq = makeCompositor({ children: [a, b] });

    const exhaustedChoice = makeCompositor({
      children: [innerSeq],
      can_insert: false,
      is_exhausted: true,
      is_satisfied: true,
      current_count: 1,
    });

    const afterChoice = makeNode({
      name: 'afterChoice',
      can_insert: true,
      current_count: 0,
      is_satisfied: false,
    });

    const model = [exhaustedChoice, afterChoice];

    markCursorPosition(model, 'b');
    const focused = computeFocusedChild(model, 'b', 'F');

    // All elements in branch are before_cursor, so focus moves to afterChoice
    assert.strictEqual(focused, 'afterChoice');
  });
});
