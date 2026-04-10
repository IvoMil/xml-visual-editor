import * as assert from 'assert';
import {
  buildResolveMarkdown,
  type NodeDetailsResponse,
  type AttributesPanelData,
} from '../../providers/xml-completion-types';

suite('buildResolveMarkdown', () => {
  const makeDetails = (overrides: Partial<NodeDetailsResponse> = {}): NodeDetailsResponse => ({
    name: 'TestElement',
    type_name: 'xs:string',
    documentation: 'A test element.',
    xpath: '/root/TestElement',
    min_occurs: 1,
    max_occurs: 1,
    ...overrides,
  });

  const makeAttrData = (attrs: AttributesPanelData['attributes'] = []): AttributesPanelData => ({
    attributes: attrs,
  });

  test('includes element name and type_name', () => {
    const md = buildResolveMarkdown('Elem', makeDetails({ type_name: 'MyType' }), null);
    assert.ok(md.value.includes('**Elem**'));
    assert.ok(md.value.includes('`MyType`'));
  });

  test('includes documentation when present', () => {
    const md = buildResolveMarkdown('E', makeDetails({ documentation: 'Hello doc' }), null);
    assert.ok(md.value.includes('Hello doc'));
  });

  test('omits documentation when empty', () => {
    const md = buildResolveMarkdown('E', makeDetails({ documentation: '' }), null);
    // Should not have triple newline (which would indicate empty doc paragraph)
    assert.ok(!md.value.includes('\n\n\n'));
  });

  test('includes compositor context when present', () => {
    const md = buildResolveMarkdown(
      'E',
      makeDetails({
        compositor_context: { parent_compositor: 'choice', parent_element: 'Root' },
      }),
      null,
    );
    assert.ok(md.value.includes('**Context:**'));
    assert.ok(md.value.includes('choice'));
    assert.ok(md.value.includes('`Root`'));
  });

  test('omits compositor context when absent', () => {
    const md = buildResolveMarkdown('E', makeDetails(), null);
    assert.ok(!md.value.includes('**Context:**'));
  });

  test('builds attributes table for required and optional attrs', () => {
    const attrData = makeAttrData([
      {
        name: 'id',
        type_name: 'xs:int',
        use: 'required',
        is_set: false,
        enum_values: [],
        documentation: '',
        default_value: null,
        fixed_value: null,
      },
      {
        name: 'label',
        type_name: 'xs:string',
        use: 'optional',
        is_set: false,
        enum_values: [],
        documentation: '',
        default_value: 'default_val',
        fixed_value: null,
      },
    ]);
    const md = buildResolveMarkdown('E', makeDetails(), attrData);
    assert.ok(md.value.includes('**Attributes:**'));
    assert.ok(md.value.includes('`id`'));
    assert.ok(md.value.includes('\u2713 required'));
    assert.ok(md.value.includes('`label`'));
    assert.ok(!md.value.includes('optional'), 'optional label should not appear');
    assert.ok(md.value.includes('(default: "default_val")'));
  });

  test('shows fixed value annotation for fixed attributes', () => {
    const attrData = makeAttrData([
      {
        name: 'version',
        type_name: 'xs:string',
        use: 'required',
        is_set: false,
        enum_values: [],
        documentation: '',
        default_value: null,
        fixed_value: '1.0',
      },
    ]);
    const md = buildResolveMarkdown('E', makeDetails(), attrData);
    assert.ok(md.value.includes('(fixed: "1.0")'));
  });

  test('omits attributes section when no attributes', () => {
    const md = buildResolveMarkdown('E', makeDetails(), makeAttrData([]));
    assert.ok(!md.value.includes('**Attributes:**'));
  });

  test('includes enumeration values when present', () => {
    const md = buildResolveMarkdown(
      'E',
      makeDetails({ enum_values: ['alpha', 'beta', 'gamma'] }),
      null,
    );
    assert.ok(md.value.includes('**Enumeration values:**'));
    assert.ok(md.value.includes('`alpha`'));
    assert.ok(md.value.includes('`beta`'));
    assert.ok(md.value.includes('`gamma`'));
  });

  test('omits enum section when no enum_values', () => {
    const md = buildResolveMarkdown('E', makeDetails({ enum_values: [] }), null);
    assert.ok(!md.value.includes('**Enumeration values:**'));
  });

  test('handles null details gracefully', () => {
    const md = buildResolveMarkdown('NullElem', null, null);
    assert.ok(md.value.includes('**NullElem**'));
    assert.ok(!md.value.includes('undefined'));
  });

  test('handles null attrData with valid details', () => {
    const md = buildResolveMarkdown('E', makeDetails(), null);
    assert.ok(!md.value.includes('**Attributes:**'));
  });

  test('markdown is trusted', () => {
    const md = buildResolveMarkdown('E', null, null);
    assert.strictEqual(md.isTrusted, true);
  });

  test('type_name omitted when empty', () => {
    const md = buildResolveMarkdown('E', makeDetails({ type_name: '' }), null);
    // Should not have backtick-wrapped empty type
    assert.ok(!md.value.includes('(``)'));
  });

  test('attribute type falls back to dash when empty', () => {
    const attrData = makeAttrData([
      {
        name: 'x',
        type_name: '',
        use: 'optional',
        is_set: false,
        enum_values: [],
        documentation: '',
        default_value: null,
        fixed_value: null,
      },
    ]);
    const md = buildResolveMarkdown('E', makeDetails(), attrData);
    // Bullet list format: empty type_name means no type suffix
    assert.ok(md.value.includes('- `x`\n'), 'attribute with empty type should have no type suffix');
    assert.ok(!md.value.includes('`x`:'), 'no colon-type separator when type is empty');
  });
});
