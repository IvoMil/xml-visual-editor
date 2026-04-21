import { strict as assert } from 'assert';
import {
  markCursorPosition,
  computeFocusedChild,
} from '../../panels/elements-panel';
import { ContentModelNode } from '../../shared/schema-table-renderer';
import { makeNode } from './elements-focus-test-helpers';

describe('Elements Panel - focus algorithms', () => {
  describe('Integration-style full flow tests', () => {
    it('Full flow for Example 1 (parameterId → domainParameterId focus)', () => {
      const description = makeNode({
        name: 'description',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });

      const moduleInstanceId = makeNode({
        name: 'moduleInstanceId',
        is_satisfied: true,
        current_count: 1,
      });
      const moduleInstanceSetId = makeNode({ name: 'moduleInstanceSetId' });
      const choice1: ContentModelNode = {
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

      const valueType = makeNode({
        name: 'valueType',
        min_occurs: 1,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });
      const parameterId = makeNode({
        name: 'parameterId',
        min_occurs: 1,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });
      const domainParameterId = makeNode({
        name: 'domainParameterId',
        max_occurs: 'unbounded',
        is_satisfied: true,
        current_count: 0,
        can_insert: true,
      });
      const qualifierId = makeNode({
        name: 'qualifierId',
        max_occurs: 'unbounded',
        is_satisfied: true,
        current_count: 0,
        can_insert: true,
      });

      const locationId = makeNode({
        name: 'locationId',
        is_satisfied: true,
        current_count: 2,
        can_insert: true,
      });
      const locationSetId = makeNode({ name: 'locationSetId', can_insert: false });
      const choice2: ContentModelNode = {
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
        children: [locationId, locationSetId],
      } as ContentModelNode;

      const model: ContentModelNode[] = [
        description,
        choice1,
        valueType,
        parameterId,
        domainParameterId,
        qualifierId,
        choice2,
      ];

      markCursorPosition(model, 'parameterId');
      const focused = computeFocusedChild(model, 'parameterId', 'F');
      assert.strictEqual(focused, 'domainParameterId');
    });

    it('Full flow for Example 2 (activity → properties focus)', () => {
      const properties = makeNode({
        name: 'properties',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 0,
        can_insert: true,
      });
      const runIndependent = makeNode({
        name: 'runIndependent',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });
      const moduleInstanceId = makeNode({
        name: 'moduleInstanceId',
        min_occurs: 1,
        max_occurs: 'unbounded',
        is_satisfied: true,
        current_count: 1,
        can_insert: true,
      });

      const model: ContentModelNode[] = [properties, runIndependent, moduleInstanceId];

      const focused = computeFocusedChild(model, null, 'E');
      assert.strictEqual(focused, 'properties');
    });
  });

  describe('Focus: next existing element after cursor', () => {
    it('focuses next existing element after cursor even if exhausted', () => {
      const variableId = makeNode({
        name: 'variableId',
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const timeSeriesSet = makeNode({
        name: 'timeSeriesSet',
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const convertDatum = makeNode({
        name: 'convertDatum',
        min_occurs: 0,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: true,
        is_exhausted: false,
        can_insert: true,
      });
      const checkMissing = makeNode({
        name: 'checkMissing',
        min_occurs: 0,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: true,
        is_exhausted: false,
        can_insert: true,
      });
      const model: ContentModelNode[] = [variableId, timeSeriesSet, convertDatum, checkMissing];

      markCursorPosition(model, 'variableId');
      const focused = computeFocusedChild(model, 'variableId', 'F');
      assert.strictEqual(focused, 'timeSeriesSet');
    });

    it('focuses first insertable when no existing element after cursor', () => {
      const variableId = makeNode({
        name: 'variableId',
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const timeSeriesSet = makeNode({
        name: 'timeSeriesSet',
        current_count: 0,
        is_satisfied: false,
        is_exhausted: false,
        can_insert: true,
      });
      const convertDatum = makeNode({
        name: 'convertDatum',
        min_occurs: 0,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: true,
        is_exhausted: false,
        can_insert: true,
      });
      const model: ContentModelNode[] = [variableId, timeSeriesSet, convertDatum];

      markCursorPosition(model, 'variableId');
      const focused = computeFocusedChild(model, 'variableId', 'F');
      assert.strictEqual(focused, 'timeSeriesSet');
    });
  });

  describe('Focus: unbounded choice group', () => {
    it('unbounded choice group not marked entirely before_cursor', () => {
      const properties = makeNode({
        name: 'properties',
        min_occurs: 0,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: true,
        can_insert: true,
      });
      const activity = makeNode({
        name: 'activity',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const parallel = makeNode({
        name: 'parallel',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: false,
        can_insert: true,
      });
      const sequence = makeNode({
        name: 'sequence',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: false,
        can_insert: true,
      });

      const choiceNode: ContentModelNode = {
        node_type: 'compositor',
        name: null,
        min_occurs: 1,
        max_occurs: 'unbounded' as any,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: false,
        can_insert: true,
        type_name: '',
        documentation: '',
        active_branch: 'activity' as any,
        children: [activity, parallel, sequence],
      } as ContentModelNode;

      const model: ContentModelNode[] = [properties, choiceNode];

      markCursorPosition(model, 'activity');

      assert.strictEqual(properties.before_cursor, true);
      assert.notStrictEqual(choiceNode.before_cursor, true);
      assert.strictEqual(choiceNode.cursor_adjacent, true);
      assert.strictEqual(choiceNode.children[0].before_cursor, true);
      assert.notStrictEqual(choiceNode.children[1].before_cursor, true);
      assert.notStrictEqual(choiceNode.children[2].before_cursor, true);
    });

    it('focus in unbounded choice group goes to first available child', () => {
      const activity = makeNode({
        name: 'activity',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const parallel = makeNode({
        name: 'parallel',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: false,
        can_insert: true,
      });
      const sequence = makeNode({
        name: 'sequence',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: false,
        can_insert: true,
      });
      const choiceNode: ContentModelNode = {
        node_type: 'compositor',
        name: null,
        min_occurs: 1,
        max_occurs: 'unbounded' as any,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: false,
        can_insert: true,
        type_name: '',
        documentation: '',
        active_branch: 'activity' as any,
        children: [activity, parallel, sequence],
      } as ContentModelNode;
      const model: ContentModelNode[] = [
        makeNode({
          name: 'properties',
          min_occurs: 0,
          current_count: 0,
          is_satisfied: true,
          can_insert: true,
        }),
        choiceNode,
      ];

      markCursorPosition(model, 'activity');
      const focused = computeFocusedChild(model, 'activity', 'F');
      assert.strictEqual(focused, 'activity');
    });

    it('exhausted choice group (max=1) marks compositor and sibling before_cursor, leaves other branches unmarked', () => {
      const properties = makeNode({
        name: 'properties',
        min_occurs: 0,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: true,
        can_insert: true,
      });
      const activity = makeNode({
        name: 'activity',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const parallel = makeNode({
        name: 'parallel',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: false,
        can_insert: false,
      });
      const sequence = makeNode({
        name: 'sequence',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 0,
        is_satisfied: false,
        can_insert: false,
      });

      const choiceNode: ContentModelNode = {
        node_type: 'compositor',
        name: null,
        min_occurs: 1,
        max_occurs: 1,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
        type_name: '',
        documentation: '',
        active_branch: 'activity' as any,
        children: [activity, parallel, sequence],
      } as ContentModelNode;

      const model: ContentModelNode[] = [properties, choiceNode];

      markCursorPosition(model, 'activity');

      // Compositor and the preceding sibling are marked before_cursor
      assert.strictEqual(choiceNode.before_cursor, true);
      assert.strictEqual(choiceNode.children[0].before_cursor, true); // activity (sibling)
      // Other choice branches after the sibling are NOT marked (bugfix behavior)
      assert.strictEqual(choiceNode.children[1].before_cursor, undefined); // parallel
      assert.strictEqual(choiceNode.children[2].before_cursor, undefined); // sequence
    });
  });
});
