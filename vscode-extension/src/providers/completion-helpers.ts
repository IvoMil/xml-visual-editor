import * as vscode from 'vscode';
import type { ContentModelNode } from '../shared/schema-table-renderer';
import { getFirstInsertableElement } from '../shared/schema-table-renderer';
import type { FlatCompletionEntry } from './xml-completion-types';

export function stripPathIndex(segment: string): string {
  return segment.replace(/\[\d+\]$/, '');
}

export function flattenContentModel(
  nodes: ContentModelNode[],
  schemaOrderStart: number,
  parentActiveBranch?: string,
  depth = 0,
): FlatCompletionEntry[] {
  const entries: FlatCompletionEntry[] = [];
  let order = schemaOrderStart;

  for (const node of nodes) {
    if (node.node_type === 'choice') {
      entries.push({
        type: 'choice_header',
        name: 'choice',
        node,
        inChoiceGroup: false,
        isInactiveBranch: false,
        schemaOrder: order++,
        depth,
      });
      const ab = node.active_branch;
      for (const child of node.children) {
        let inactive: boolean;
        if (!ab) {
          inactive = false;
        } else if (child.node_type === 'element') {
          inactive = child.name !== ab;
        } else {
          // Sequence/all branch: active if any child element matches active_branch
          inactive = !(child.children ?? []).some((c) => c.name === ab);
        }
        if (child.node_type === 'element' && child.name && !child.is_wildcard) {
          entries.push({
            type: 'element',
            name: child.name,
            node: child,
            inChoiceGroup: true,
            isInactiveBranch: inactive,
            schemaOrder: order++,
            depth: depth + 1,
            parentChoiceExhausted: node.is_exhausted,
            parentChoiceNode: node,
          });
        } else if (child.node_type === 'sequence' || child.node_type === 'all') {
          const nested = flattenContentModel([child], order, inactive ? ab : undefined, depth + 1);
          for (const n of nested) {
            n.inChoiceGroup = true;
            n.parentChoiceExhausted = node.is_exhausted;
            n.parentChoiceNode = node;
            if (inactive) n.isInactiveBranch = true;
          }
          entries.push(...nested);
          order += nested.length;
        }
      }
    } else if (node.node_type === 'element' && node.name && !node.is_wildcard) {
      const inactive = !!parentActiveBranch && node.name !== parentActiveBranch;
      entries.push({
        type: 'element',
        name: node.name,
        node,
        inChoiceGroup: false,
        isInactiveBranch: inactive,
        schemaOrder: order++,
        depth,
      });
    } else if (node.node_type === 'sequence' || node.node_type === 'all') {
      if (depth > 0 && node.children.length > 1) {
        entries.push({
          type: 'sequence_header',
          name: 'sequence',
          node,
          inChoiceGroup: false,
          isInactiveBranch: false,
          schemaOrder: order++,
          depth,
        });
      }
      const nested = flattenContentModel(node.children, order, parentActiveBranch, depth + 1);
      entries.push(...nested);
      order += nested.length;
    }
  }

  return entries;
}

export function collectElementNames(nodes: ContentModelNode[]): string[] {
  return nodes.flatMap((n) =>
    n.node_type === 'element' && n.name && !n.is_wildcard
      ? [n.name]
      : n.children
        ? collectElementNames(n.children)
        : [],
  );
}

export function buildHeaderItem(
  entry: FlatCompletionEntry,
  replaceRange: vscode.Range | undefined,
  parentPath: string[],
  schemaId: string,
  docId: string,
): vscode.CompletionItem {
  let label: string;
  let desc: string;
  if (entry.type === 'choice_header') {
    const count = entry.node.children.length;
    const maxStr = entry.node.max_occurs === 'unbounded' ? '\u221E' : String(entry.node.max_occurs);
    const cardinality = `${entry.node.min_occurs}..${maxStr}`;
    const active = entry.node.active_branch ? ` \u00B7 active: ${entry.node.active_branch}` : '';
    const indent = '\u00A0\u00A0'.repeat(entry.depth);
    label = `${indent}\u25C7 choice`;
    desc = `${cardinality} \u00B7 ${count} options${active}`;
    if (entry.node.is_exhausted) {
      desc = `\u2713 ${desc}`;
    } else if (entry.node.current_count > 0) {
      desc = `\u2713 ${desc}`;
    } else if (entry.node.min_occurs > 0) {
      desc += ' (required)';
    }
  } else {
    const maxStr = entry.node.max_occurs === 'unbounded' ? '\u221E' : String(entry.node.max_occurs);
    const cardinality = `${entry.node.min_occurs}..${maxStr}`;
    const indent = '\u00A0\u00A0'.repeat(entry.depth);
    label = `${indent}\u25B7 sequence`;
    desc = `${cardinality} \u00B7 ${entry.node.children.length} elements`;
    if (entry.node.is_exhausted) {
      desc = `\u2713 ${desc}`;
    } else if (entry.node.current_count > 0) {
      desc = `\u2713 ${desc}`;
    } else if (entry.node.min_occurs > 0) {
      desc += ' (required)';
    }
  }
  const kind =
    entry.type === 'choice_header'
      ? vscode.CompletionItemKind.Enum
      : vscode.CompletionItemKind.Constant;
  const item = new vscode.CompletionItem({ label, description: desc }, kind);
  item.sortText = '1' + String(entry.schemaOrder).padStart(5, '0');
  item.insertText = '';
  const nameFilter = collectElementNames(entry.node.children).join(' ');
  item.filterText = replaceRange ? '<' + nameFilter : nameFilter;
  if (replaceRange) item.range = replaceRange;

  const firstElement = getFirstInsertableElement(entry.node);
  if (firstElement) {
    item.command = {
      command: 'xmlVisualEditor.completionInsertElement',
      title: 'Insert Element',
      arguments: [firstElement, parentPath, schemaId, docId, true],
    };
  }

  return item;
}

export function detectElementReplaceRange(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Range | undefined {
  const line = document.lineAt(position.line).text;
  const textBefore = line.substring(0, position.character);
  let ltPos = -1;
  for (let i = textBefore.length - 1; i >= 0; i--) {
    const ch = textBefore[i];
    if (ch === '<') {
      ltPos = i;
      break;
    }
    if (!/[a-zA-Z0-9_\-.:]/i.test(ch)) {
      break;
    }
  }
  if (ltPos >= 0) {
    const range = new vscode.Range(new vscode.Position(position.line, ltPos), position);
    return range;
  }
  return undefined;
}

export function detectAttributeValueRange(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Range | undefined {
  const line = document.lineAt(position.line).text;
  let start = position.character;
  let end = position.character;

  // Scan backward for opening quote
  let i = position.character - 1;
  while (i >= 0) {
    const ch = line[i];
    if (ch === '"' || ch === "'") {
      start = i + 1;
      break;
    }
    if (ch === '<' || ch === '>') {
      return undefined;
    }
    i--;
  }

  // Scan forward for closing quote
  const quoteChar = i >= 0 ? line[i] : '"';
  let j = position.character;
  while (j < line.length) {
    if (line[j] === quoteChar) {
      end = j;
      break;
    }
    if (line[j] === '<' || line[j] === '>') {
      end = j;
      break;
    }
    j++;
  }

  if (start <= end) {
    return new vscode.Range(position.line, start, position.line, end);
  }
  return undefined;
}

export function detectTextContentRange(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Range | undefined {
  const text = document.getText();
  const offset = document.offsetAt(position);

  let startOffset = -1;
  for (let i = offset - 1; i >= 0; i--) {
    if (text[i] === '>') {
      startOffset = i + 1;
      break;
    }
    if (text[i] === '<') return undefined;
  }

  let endOffset = offset;
  for (let i = offset; i < text.length - 1; i++) {
    if (text[i] === '<' && text[i + 1] === '/') {
      endOffset = i;
      break;
    }
  }

  if (startOffset >= 0) {
    return new vscode.Range(document.positionAt(startOffset), document.positionAt(endOffset));
  }
  return undefined;
}
