import { strict as assert } from 'assert';
import {
  markCursorPosition,
  computeFocusedChild,
  extractSimpleTextContent,
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

  describe('Bug C regression — focus prefers positional proximity over priority chain', () => {
    it('Context E: focuses first child (description) not distant required (layerGroup)', () => {
      // geoMap scenario: description is first child, layerGroup is required but deeper in sequence
      const description = makeNode({
        name: 'description',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 0,
        can_insert: true,
      });
      const projection = makeNode({
        name: 'projection',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 0,
        can_insert: true,
      });
      const layerGroup = makeNode({
        name: 'layerGroup',
        min_occurs: 1,
        is_satisfied: false,
        current_count: 0,
        can_insert: true,
      });
      const model: ContentModelNode[] = [description, projection, layerGroup];

      const focused = computeFocusedChild(model, null, 'E');
      // Bug C old behavior: focused on 'layerGroup' (first unsatisfied)
      // Fixed: focuses on 'description' (first visible element in document order)
      assert.strictEqual(focused, 'description');
    });

    it('Context F/G: focuses next after cursor, not distant present element', () => {
      // backgroundColor scenario: cursor after backgroundColor, next is backgroundOpaquenessPercentage
      const backgroundColor = makeNode({
        name: 'backgroundColor',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });
      const backgroundOpaquenessPercentage = makeNode({
        name: 'backgroundOpaquenessPercentage',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 0,
        can_insert: true,
      });
      const layerGroup = makeNode({
        name: 'layerGroup',
        min_occurs: 1,
        is_satisfied: false,
        current_count: 0,
        can_insert: true,
      });
      const model: ContentModelNode[] = [
        backgroundColor,
        backgroundOpaquenessPercentage,
        layerGroup,
      ];

      markCursorPosition(model, 'backgroundColor');
      const focused = computeFocusedChild(model, 'backgroundColor', 'F');
      // Bug C old behavior: focused on 'layerGroup' (first unsatisfied)
      // Fixed: focuses on 'backgroundOpaquenessPercentage' (first visible after cursor)
      assert.strictEqual(focused, 'backgroundOpaquenessPercentage');
    });

    it('Context F/G: focuses next insertable, not distant present element with checkmark', () => {
      // showApplyToButton scenario: cursor after showApplyToButton, next is showReRunButton
      const showApplyToButton = makeNode({
        name: 'showApplyToButton',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });
      const showReRunButton = makeNode({
        name: 'showReRunButton',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 0,
        can_insert: true,
      });
      const createModifierButtons = makeNode({
        name: 'createModifierButtons',
        min_occurs: 0,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });
      const model: ContentModelNode[] = [showApplyToButton, showReRunButton, createModifierButtons];

      markCursorPosition(model, 'showApplyToButton');
      const focused = computeFocusedChild(model, 'showApplyToButton', 'F');
      // Bug C old behavior: focused on 'createModifierButtons' (present with current_count > 0)
      // Fixed: focuses on 'showReRunButton' (first visible after cursor)
      assert.strictEqual(focused, 'showReRunButton');
    });
  });

  describe('Bug E regression — inactive choice branch focus in context E', () => {
    it('Context E: skips inactive choice branch, focuses active element', () => {
      // prefix scenario: choice with max_occurs=1, active branch is timeZeroFormattingString
      // simpleString is inactive (can_insert=false, current_count=0)
      const simpleString = makeNode({
        name: 'simpleString',
        min_occurs: 1,
        is_satisfied: false,
        current_count: 0,
        can_insert: false, // inactive branch
      });
      const timeZeroFormattingString = makeNode({
        name: 'timeZeroFormattingString',
        min_occurs: 1,
        is_satisfied: true,
        current_count: 1,
        can_insert: false,
        is_exhausted: true,
      });
      const currentTimeFormattingString = makeNode({
        name: 'currentTimeFormattingString',
        min_occurs: 1,
        is_satisfied: false,
        current_count: 0,
        can_insert: false, // inactive branch
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
        active_branch: 'timeZeroFormattingString' as any,
        children: [simpleString, timeZeroFormattingString, currentTimeFormattingString],
      } as ContentModelNode;

      const model: ContentModelNode[] = [choiceNode];

      const focused = computeFocusedChild(model, null, 'E');
      // simpleString is inactive (can_insert=false, current_count=0) → skipped
      // timeZeroFormattingString is the active branch → focused
      assert.strictEqual(focused, 'timeZeroFormattingString');
    });
  });

  describe('extractSimpleTextContent', () => {
    it('Basic extraction', () => {
      const text = '<type>accumulative</type>';
      const res = extractSimpleTextContent(text, 10, 'type');
      assert.strictEqual(res, 'accumulative');
    });

    it('Empty element', () => {
      const text = '<type></type>';
      const res = extractSimpleTextContent(text, 6, 'type');
      assert.strictEqual(res, '');
    });

    it('Whitespace trimming', () => {
      const text = '<type>  accumulative  </type>';
      const res = extractSimpleTextContent(text, 10, 'type');
      assert.strictEqual(res, 'accumulative');
    });

    it('No closing tag', () => {
      const text = '<type>accumulative';
      const res = extractSimpleTextContent(text, 10, 'type');
      assert.strictEqual(res, '');
    });

    it('Self-closing element returns empty', () => {
      const text = '<type />';
      const res = extractSimpleTextContent(text, 5, 'type');
      assert.strictEqual(res, '');
    });

    it('Cursor in opening tag extracts text content', () => {
      const text = '<type attr="val">text</type>';
      const res = extractSimpleTextContent(text, 3, 'type');
      assert.strictEqual(res, 'text');
    });

    it('Nested with same name', () => {
      const text = '<outer><type>hello</type></outer>';
      const res = extractSimpleTextContent(text, 15, 'type');
      assert.strictEqual(res, 'hello');
    });

    it('Element with attributes', () => {
      const text = '<type unit="day">accumulative</type>';
      const res = extractSimpleTextContent(text, 25, 'type');
      assert.strictEqual(res, 'accumulative');
    });
  });

  describe('Focus: user regression — variable element context', () => {
    it('Context F with no preceding sibling focuses first visible element (Bug C: positional proximity)', () => {
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

      const focused = computeFocusedChild(model, null, 'F');
      // Bug C fix: findFirstNode() returns first visible element (variableId is present)
      assert.strictEqual(focused, 'variableId');
    });

    it('Context E with no preceding sibling focuses first existing element', () => {
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
      const model: ContentModelNode[] = [variableId, timeSeriesSet, convertDatum];

      const focused = computeFocusedChild(model, null, 'E');
      assert.strictEqual(focused, 'variableId');
    });

    it('Context F with no elements present focuses first unsatisfied', () => {
      const variableId = makeNode({
        name: 'variableId',
        current_count: 0,
        is_satisfied: false,
        is_exhausted: false,
        can_insert: true,
      });
      const timeSeriesSet = makeNode({
        name: 'timeSeriesSet',
        current_count: 0,
        is_satisfied: false,
        is_exhausted: false,
        can_insert: true,
      });
      const model: ContentModelNode[] = [variableId, timeSeriesSet];

      const focused = computeFocusedChild(model, null, 'F');
      assert.strictEqual(focused, 'variableId');
    });
  });

  describe('Focus: regression — cursor before first child (no preceding sibling)', () => {
    it('context F, no preceding sibling, first 2 children present/exhausted → focuses first existing child', () => {
      const variableId = makeNode({
        name: 'variableId',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const timeSeriesSet = makeNode({
        name: 'timeSeriesSet',
        min_occurs: 1,
        max_occurs: 1,
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

      // No markCursorPosition — cursor is before all children (no preceding sibling)
      const focused = computeFocusedChild(model, null, 'F');
      // EXPECTED: variableId (first existing element after cursor) — NOT convertDatum
      assert.strictEqual(focused, 'variableId');
    });

    it('context E, first 2 children present/exhausted → focuses first existing child', () => {
      const variableId = makeNode({
        name: 'variableId',
        min_occurs: 1,
        max_occurs: 1,
        current_count: 1,
        is_satisfied: true,
        is_exhausted: true,
        can_insert: false,
      });
      const timeSeriesSet = makeNode({
        name: 'timeSeriesSet',
        min_occurs: 1,
        max_occurs: 1,
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
        can_insert: true,
      });
      const model: ContentModelNode[] = [variableId, timeSeriesSet, convertDatum];

      const focused = computeFocusedChild(model, null, 'E');
      // EXPECTED: variableId (first existing element) — NOT convertDatum
      assert.strictEqual(focused, 'variableId');
    });

    it('context F, no preceding sibling, NO children present → focuses first unsatisfied', () => {
      const a = makeNode({
        name: 'a',
        min_occurs: 1,
        is_satisfied: false,
        can_insert: true,
        current_count: 0,
      });
      const b = makeNode({
        name: 'b',
        min_occurs: 0,
        is_satisfied: true,
        can_insert: true,
        current_count: 0,
      });
      const model: ContentModelNode[] = [a, b];

      const focused = computeFocusedChild(model, null, 'F');
      assert.strictEqual(focused, 'a');
    });
  });
});
