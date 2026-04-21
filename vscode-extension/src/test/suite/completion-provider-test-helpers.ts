import * as vscode from 'vscode';
import { XmlCompletionProvider } from '../../providers/xml-completion-provider';
import type { ContentModelNode } from '../../shared/schema-table-renderer';

export function mockDocument(content: string, scheme = 'file'): vscode.TextDocument {
  const lines = content.split('\n');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return {
    uri: { scheme, fsPath: '/test.xml', toString: () => 'file:///test.xml' },
    languageId: 'xml',
    lineCount: lines.length,
    getText: (range?: vscode.Range) => {
      if (!range) return content;
      const startOff =
        lines.slice(0, range.start.line).join('\n').length +
        (range.start.line > 0 ? 1 : 0) +
        range.start.character;
      const endOff =
        lines.slice(0, range.end.line).join('\n').length +
        (range.end.line > 0 ? 1 : 0) +
        range.end.character;
      return content.substring(startOff, endOff);
    },
    lineAt: (line: number) => ({ text: lines[line] ?? '' }),
    offsetAt: (pos: vscode.Position) => {
      let offset = 0;
      for (let i = 0; i < pos.line; i++) {
        offset += (lines[i]?.length ?? 0) + 1; // +1 for '\n'
      }
      return offset + pos.character;
    },
    positionAt: (offset: number) => {
      let remaining = offset;
      for (let i = 0; i < lines.length; i++) {
        if (remaining <= lines[i].length) {
          return new vscode.Position(i, remaining);
        }
        remaining -= lines[i].length + 1; // +1 for '\n'
      }
      return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
    },
  } as any;
}

export const noToken: vscode.CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => ({ dispose: () => {} }),
} as any;

export function makeNode(overrides: Partial<ContentModelNode> = {}): ContentModelNode {
  return {
    name: 'child',
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
  };
}

export function createProvider(
  panelData: any,
  nodeDetailsResponse: any = null,
  attrResponse: any = null,
): XmlCompletionProvider {
  const engineMock = {
    isReady: () => true,
    sendRequest: (method: string, _params: any) => {
      if (method === 'document.update') return Promise.resolve({});
      if (method === 'helper.getElementsPanelData') return Promise.resolve(panelData);
      if (method === 'helper.getNodeDetails') return Promise.resolve(nodeDetailsResponse);
      if (method === 'helper.getAttributesPanelData') return Promise.resolve(attrResponse);
      return Promise.resolve({});
    },
  } as any;
  const schemaMock = { getSchemaIdForDocument: () => 'schema_1' } as any;
  return new XmlCompletionProvider(
    engineMock,
    schemaMock,
    () => 'doc_1',
    () => false,
  );
}

export async function getItems(
  provider: XmlCompletionProvider,
  xml: string,
): Promise<vscode.CompletionItem[]> {
  const lines = xml.split('\n');
  const lastLine = lines.length - 1;
  const lastCol = lines[lastLine].length;
  const doc = mockDocument(xml);
  const pos = new vscode.Position(lastLine, lastCol);
  const result = await provider.provideCompletionItems(doc, pos, noToken, {} as any);
  return result?.items ?? [];
}
