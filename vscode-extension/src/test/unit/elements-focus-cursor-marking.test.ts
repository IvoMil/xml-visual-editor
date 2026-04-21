import { strict as assert } from 'assert';
import {
  markCursorPosition,
  computeFocusedChild,
} from '../../panels/elements-panel';
import { ContentModelNode } from '../../shared/schema-table-renderer';
import { makeNode } from './elements-focus-test-helpers';

describe('Elements Panel - focus algorithms', () => {
  describe('markCursorPosition', () => {
    it('Marks nodes before preceding sibling as before_cursor', () => {
      const description = makeNode({ name: 'description' });
      const valueType = makeNode({ name: 'valueType' });
      const parameterId = makeNode({ name: 'parameterId' });
      const model: ContentModelNode[] = [description, valueType, parameterId];

      markCursorPosition(model, 'parameterId');

      assert.strictEqual(description.before_cursor, true);
      assert.strictEqual(valueType.before_cursor, true);
      assert.strictEqual(parameterId.before_cursor, true);
    });

    it('Sets cursor_adjacent when preceding sibling is unbounded (can_insert=true)', () => {
      const description = makeNode({ name: 'description' });
      const parameterId = makeNode({
        name: 'parameterId',
        max_occurs: 'unbounded',
        can_insert: true,
      });
      const domainParameterId = makeNode({ name: 'domainParameterId' });
      const model: ContentModelNode[] = [description, parameterId, domainParameterId];

      markCursorPosition(model, 'parameterId');

      assert.strictEqual(parameterId.before_cursor, true);
      assert.strictEqual(parameterId.cursor_adjacent, true);
    });

    it('Does NOT set cursor_adjacent when preceding sibling is exhausted (can_insert=false)', () => {
      const description = makeNode({ name: 'description' });
      const parameterId = makeNode({ name: 'parameterId', max_occurs: 1, can_insert: false });
      const domainParameterId = makeNode({ name: 'domainParameterId' });
      const model: ContentModelNode[] = [description, parameterId, domainParameterId];

      markCursorPosition(model, 'parameterId');

      assert.strictEqual(parameterId.before_cursor, true);
      assert.strictEqual(parameterId.cursor_adjacent, undefined);
    });

    it('Preceding sibling inside compositor marks compositor and sibling before_cursor, leaves subsequent branch elements unmarked', () => {
      const moduleInstanceId = makeNode({
        name: 'moduleInstanceId',
        can_insert: true,
        max_occurs: 'unbounded',
      });
      const moduleInstanceSetId = makeNode({ name: 'moduleInstanceSetId' });
      const choiceNode: ContentModelNode = {
        node_type: 'compositor',
        name: null,
        min_occurs: 0,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: false,
        is_exhausted: false,
        can_insert: false,
        type_name: '',
        documentation: '',
        children: [moduleInstanceId, moduleInstanceSetId],
      } as ContentModelNode;

      const parameterId = makeNode({ name: 'parameterId' });
      const model: ContentModelNode[] = [choiceNode, parameterId];

      markCursorPosition(model, 'moduleInstanceId');

      // choice node and preceding sibling marked before_cursor
      assert.strictEqual(choiceNode.before_cursor, true);
      assert.strictEqual(moduleInstanceId.before_cursor, true);
      // Elements after preceding sibling in branch are NOT marked (bugfix behavior)
      assert.strictEqual(moduleInstanceSetId.before_cursor, undefined);
      // child should get cursor_adjacent since can_insert
      assert.strictEqual(moduleInstanceId.cursor_adjacent, true);
    });

    it('Elements after preceding sibling are NOT marked', () => {
      const description = makeNode({ name: 'description' });
      const parameterId = makeNode({ name: 'parameterId' });
      const domainParameterId = makeNode({ name: 'domainParameterId' });
      const locationId = makeNode({ name: 'locationId' });
      const model: ContentModelNode[] = [description, parameterId, domainParameterId, locationId];

      markCursorPosition(model, 'parameterId');

      // elements after parameterId should not be marked
      assert.strictEqual(domainParameterId.before_cursor, undefined);
      assert.strictEqual(locationId.before_cursor, undefined);
    });
  });

  describe('computeFocusedChild - Context E', () => {
    it('Focuses first unsatisfied element', () => {
      const requiredA = makeNode({ name: 'required_a', is_satisfied: false, can_insert: true });
      const optionalB = makeNode({ name: 'optional_b', is_satisfied: true, can_insert: true });
      const model: ContentModelNode[] = [requiredA, optionalB];

      const focused = computeFocusedChild(model, null, 'E');
      assert.strictEqual(focused, 'required_a');
    });

    it('Focuses first insertable when all satisfied (regression)', () => {
      const optionalA = makeNode({
        name: 'optional_a',
        is_satisfied: true,
        can_insert: true,
        current_count: 0,
      });
      const existingB = makeNode({
        name: 'existing_b',
        is_satisfied: true,
        can_insert: true,
        current_count: 1,
      });
      const model: ContentModelNode[] = [optionalA, existingB];

      const focused = computeFocusedChild(model, null, 'E');
      assert.strictEqual(focused, 'optional_a');
    });

    it('Focuses first visible element even if exhausted (Bug C: positional proximity)', () => {
      const exhaustedA = makeNode({
        name: 'exhausted_a',
        can_insert: false,
        current_count: 1,
        is_exhausted: true,
        is_satisfied: true,
      });
      const optionalB = makeNode({
        name: 'optional_b',
        can_insert: true,
        current_count: 0,
        is_satisfied: true,
      });
      const model: ContentModelNode[] = [exhaustedA, optionalB];

      const focused = computeFocusedChild(model, null, 'E');
      // Bug C fix: findFirstNode() returns first visible element (exhausted but present)
      assert.strictEqual(focused, 'exhausted_a');
    });
  });

  describe('computeFocusedChild - Context F/G', () => {
    it('Returns cursor_adjacent element when preceding sibling is unbounded', () => {
      const parameterId = makeNode({ name: 'parameterId', can_insert: true });
      parameterId.before_cursor = true;
      parameterId.cursor_adjacent = true;
      const domainParameterId = makeNode({ name: 'domainParameterId', can_insert: true });
      const model: ContentModelNode[] = [parameterId, domainParameterId];

      const focused = computeFocusedChild(model, 'parameterId', 'F');
      assert.strictEqual(focused, 'parameterId');
    });

    it('Focuses first insertable after exhausted preceding sibling (regression)', () => {
      const description = makeNode({ name: 'description' });
      const parameterId = makeNode({
        name: 'parameterId',
        can_insert: false,
        min_occurs: 1,
        max_occurs: 1,
      });
      const domainParameterId = makeNode({
        name: 'domainParameterId',
        can_insert: true,
        max_occurs: 'unbounded',
        current_count: 0,
      });
      const locationId = makeNode({
        name: 'locationId',
        can_insert: true,
        max_occurs: 'unbounded',
        current_count: 2,
      });
      const model: ContentModelNode[] = [description, parameterId, domainParameterId, locationId];

      // Simulate marking cursor position at parameterId
      markCursorPosition(model, 'parameterId');

      const focused = computeFocusedChild(model, 'parameterId', 'F');
      assert.strictEqual(focused, 'domainParameterId');
    });

    it('Without preceding sibling - Focuses first insertable', () => {
      const properties = makeNode({
        name: 'properties',
        can_insert: true,
        current_count: 0,
        is_satisfied: true,
      });
      const runIndependent = makeNode({
        name: 'runIndependent',
        can_insert: false,
        current_count: 1,
        is_satisfied: true,
      });
      const model: ContentModelNode[] = [properties, runIndependent];

      const focused = computeFocusedChild(model, null, 'F');
      assert.strictEqual(focused, 'properties');
    });

    it('Without preceding sibling - Focuses first visible element (Bug C: positional proximity)', () => {
      const optionalA = makeNode({ name: 'optional_a', can_insert: true, is_satisfied: true });
      const requiredB = makeNode({ name: 'required_b', can_insert: true, is_satisfied: false });
      const model: ContentModelNode[] = [optionalA, requiredB];

      const focused = computeFocusedChild(model, null, 'F');
      // Bug C fix: findFirstNode() returns first visible element regardless of satisfaction
      assert.strictEqual(focused, 'optional_a');
    });

    it('Skips before_cursor nodes', () => {
      const a = makeNode({ name: 'a', can_insert: false, is_exhausted: true });
      a.before_cursor = true;
      const b = makeNode({ name: 'b', can_insert: true, is_satisfied: true });
      const model: ContentModelNode[] = [a, b];

      const focused = computeFocusedChild(model, 'a', 'F');
      assert.strictEqual(focused, 'b');
    });

    it('Skips inactive choice branch elements', () => {
      const activeChild = makeNode({ name: 'active', can_insert: true, current_count: 1 });
      const inactiveChild = makeNode({ name: 'inactive', can_insert: false, current_count: 0 });
      const choiceNode: ContentModelNode = {
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
        children: [inactiveChild, activeChild],
      } as ContentModelNode;

      const model: ContentModelNode[] = [choiceNode];

      const focused = computeFocusedChild(model, null, 'F');
      assert.strictEqual(focused, 'active');
    });
  });

  describe('computeFocusedChild - Other contexts', () => {
    it('Context A returns undefined', () => {
      const node = makeNode({ name: 'x' });
      const focused = computeFocusedChild([node], null, 'A');
      assert.strictEqual(focused, undefined);
    });

    it('Context C returns undefined', () => {
      const node = makeNode({ name: 'x' });
      const focused = computeFocusedChild([node], null, 'C');
      assert.strictEqual(focused, undefined);
    });

    it('Context I returns undefined', () => {
      const node = makeNode({ name: 'x' });
      const focused = computeFocusedChild([node], null, 'I');
      assert.strictEqual(focused, undefined);
    });
  });
});
