import * as assert from 'assert';
import * as vscode from 'vscode';
import { XmlCompletionProvider } from '../../providers/xml-completion-provider';
import { makeNode, mockDocument, noToken } from './completion-provider-test-helpers';

suite('XmlCompletionProvider — text-content completions', () => {
  function createProviderForText(nodeDetailsResponse: any): {
    provider: XmlCompletionProvider;
    calls: any[];
  } {
    const calls: any[] = [];
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string, params: any) => {
        calls.push({ method, params });
        if (method === 'document.update') return Promise.resolve({});
        if (method === 'helper.getNodeDetails') {
          if (nodeDetailsResponse instanceof Error) return Promise.reject(nodeDetailsResponse);
          return Promise.resolve(nodeDetailsResponse);
        }
        return Promise.resolve({});
      },
    } as any;
    const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
    const provider = new XmlCompletionProvider(
      engineMock,
      schemaMock,
      () => 'doc_1',
      () => false,
    );
    return { provider, calls };
  }

  async function getItemsLocal(provider: XmlCompletionProvider, xml: string) {
    const lines = xml.split('\n');
    const lastLine = lines.length - 1;
    const lastCol = lines[lastLine].length;
    const doc = mockDocument(xml);
    const pos = new vscode.Position(lastLine, lastCol);
    const result = await provider.provideCompletionItems(doc, pos, noToken, {} as any);
    return result?.items ?? [];
  }

  test('text-content completions resolve type via helper.getNodeDetails with path-based resolution', async () => {
    const { provider, calls } = createProviderForText({
      type_name: 'LeafType',
      enum_values: ['one', 'two'],
    });
    const items = await getItemsLocal(provider, '<root>\n  <leaf>');
    assert.strictEqual(items.length, 2);
    // should call helper.getNodeDetails with element_path
    const detailsCall = calls.find((c) => c.method === 'helper.getNodeDetails');
    assert.ok(detailsCall, 'expected helper.getNodeDetails to be called');
    assert.strictEqual(detailsCall.params.element_name, 'leaf');
    assert.ok(detailsCall.params.element_path, 'expected element_path to be passed');
    // verify returned items
    const labels = items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.deepStrictEqual(labels, ['one', 'two']);
  });

  test('text-content completions return null when getNodeDetails fails', async () => {
    const { provider } = createProviderForText(new Error('fail'));
    const items = await getItemsLocal(provider, '<root>\n  <leaf>');
    assert.strictEqual(items.length, 0);
  });

  test('text-content completions return null when no enum values', async () => {
    const { provider } = createProviderForText({ type_name: 'LeafType', enum_values: [] });
    const items = await getItemsLocal(provider, '<root>\n  <leaf>');
    assert.strictEqual(items.length, 0);
  });
});

suite('XmlCompletionProvider — resolveCompletionItem', () => {
  test('returns enriched documentation from engine', async () => {
    const nodeDetails = {
      name: 'TestEl',
      type_name: 'TestType',
      documentation: 'Test doc text',
      xpath: '/root/TestEl',
      min_occurs: 1,
      max_occurs: 1,
    };
    const attrData = {
      attributes: [
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
      ],
    };
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string) => {
        if (method === 'document.update') return Promise.resolve({});
        if (method === 'helper.getElementsPanelData')
          return Promise.resolve({
            content_model: [
              makeNode({ name: 'TestEl', type_name: 'TestType', documentation: 'Test doc text' }),
            ],
            content_complete: false,
            missing_required: [],
          });
        if (method === 'helper.getNodeDetails') return Promise.resolve(nodeDetails);
        if (method === 'helper.getAttributesPanelData') return Promise.resolve(attrData);
        return Promise.resolve({});
      },
    } as any;
    const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
    const provider = new XmlCompletionProvider(
      engineMock,
      schemaMock,
      () => 'doc_1',
      () => false,
    );

    // First trigger provideCompletionItems to populate resolveDataMap
    const xml = '<root>\n  <';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 3);
    const list = await provider.provideCompletionItems(doc, pos, noToken, {} as any);
    assert.ok(list);

    // Find the element item
    const elemItem = list.items.find(
      (i) => typeof i.label !== 'string' && i.label.label.includes('TestEl'),
    );
    assert.ok(elemItem, 'TestEl item should exist');

    // Resolve it
    const resolved = await provider.resolveCompletionItem(elemItem, noToken);
    assert.ok(resolved.documentation instanceof vscode.MarkdownString);
    const mdValue = resolved.documentation.value;
    assert.ok(mdValue.includes('**TestEl**'), 'should have element name');
    assert.ok(mdValue.includes('Test doc text'), 'should have documentation');
    assert.ok(mdValue.includes('`id`'), 'should have attribute name');
  });

  test('keeps original documentation on engine failure', async () => {
    const engineMock = {
      isReady: () => true,
      sendRequest: (method: string) => {
        if (method === 'document.update') return Promise.resolve({});
        if (method === 'helper.getElementsPanelData')
          return Promise.resolve({
            content_model: [makeNode({ name: 'FailEl' })],
            content_complete: false,
            missing_required: [],
          });
        if (method === 'helper.getNodeDetails') return Promise.reject(new Error('fail'));
        if (method === 'helper.getAttributesPanelData') return Promise.reject(new Error('fail'));
        return Promise.resolve({});
      },
    } as any;
    const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
    const provider = new XmlCompletionProvider(
      engineMock,
      schemaMock,
      () => 'doc_1',
      () => false,
    );

    const xml = '<root>\n  <';
    const doc = mockDocument(xml);
    const pos = new vscode.Position(1, 3);
    await provider.provideCompletionItems(doc, pos, noToken, {} as any);

    // Create an item with no resolveKey match
    const item = new vscode.CompletionItem('nonexistent');
    item.documentation = new vscode.MarkdownString('original');
    const resolved = await provider.resolveCompletionItem(item, noToken);
    assert.ok(
      resolved.documentation instanceof vscode.MarkdownString &&
        resolved.documentation.value === 'original',
    );
  });
});
