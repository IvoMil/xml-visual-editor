import { strict as assert } from 'assert';
import {
  markCursorPosition,
  computeFocusedChild,
  extractSimpleTextContent,
} from '../../panels/elements-panel';
import { ContentModelNode } from '../../shared/schema-table-renderer';
import { makeNode } from './elements-focus-test-helpers';

describe('Elements Panel - focus algorithms', () => {
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
