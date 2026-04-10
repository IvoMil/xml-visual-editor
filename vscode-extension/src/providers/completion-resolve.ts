import * as vscode from 'vscode';
import type { EngineClient } from '../engine/engine-client';
import {
  buildResolveMarkdown,
  type AttributesPanelData,
  type NodeDetailsResponse,
  type ResolveData,
} from './xml-completion-types';

export async function resolveCompletionItemData(
  engineClient: EngineClient,
  resolveDataMap: Map<string, ResolveData>,
  item: vscode.CompletionItem,
  token: vscode.CancellationToken,
): Promise<vscode.CompletionItem> {
  const label = typeof item.label === 'string' ? item.label : item.label.label;
  const resolveKey = item.detail ? `${label}::${item.detail}` : label;
  const data = resolveDataMap.get(resolveKey);
  if (!data) {
    return item;
  }

  const childPath = [...data.parentPath, data.elementName];
  const params = {
    schema_id: data.schemaId,
    element_name: data.elementName,
    element_path: childPath,
    doc_id: data.docId,
  };

  if (token.isCancellationRequested) {
    return item;
  }

  try {
    const [nodeDetails, attrData] = await Promise.all([
      engineClient.sendRequest('helper.getNodeDetails', params).catch(() => {
        return null;
      }) as Promise<NodeDetailsResponse | null>,
      engineClient.sendRequest('helper.getAttributesPanelData', params).catch(() => {
        return null;
      }) as Promise<AttributesPanelData | null>,
    ]);

    if (token.isCancellationRequested) {
      return item;
    }

    if (nodeDetails || attrData) {
      const md = buildResolveMarkdown(data.elementName, nodeDetails, attrData);
      item.documentation = md;
    }
  } catch {
    /* empty */
  }

  return item;
}
