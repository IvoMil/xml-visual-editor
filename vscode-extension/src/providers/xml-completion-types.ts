import * as vscode from 'vscode';
import type { ContentModelNode } from '../shared/schema-table-renderer';

export interface FlatCompletionEntry {
  type: 'element' | 'choice_header' | 'sequence_header';
  name: string;
  node: ContentModelNode;
  inChoiceGroup: boolean;
  isInactiveBranch: boolean;
  schemaOrder: number;
  depth: number;
  parentChoiceExhausted?: boolean;
  parentChoiceNode?: ContentModelNode;
}

export interface ElementsPanelData {
  content_model: ContentModelNode[];
  content_complete: boolean;
  missing_required: string[];
}

export interface AttributeInfo {
  name: string;
  type_name: string;
  use: string;
  is_set: boolean;
  enum_values: string[];
  documentation: string;
  default_value: string | null;
  fixed_value: string | null;
}

export interface AttributesPanelData {
  attributes: AttributeInfo[];
}

export interface NodeDetailsResponse {
  name: string;
  type_name: string;
  documentation: string;
  xpath: string;
  min_occurs: number;
  max_occurs: number | 'unbounded';
  enum_values?: string[];
  compositor_context?: { parent_compositor: string; parent_element: string };
}

export interface ResolveData {
  elementName: string;
  parentPath: string[];
  schemaId: string;
  docId: string;
}

export function buildResolveMarkdown(
  name: string,
  details: NodeDetailsResponse | null,
  attrData: AttributesPanelData | null,
): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  const typeName = details?.type_name ? ` (\`${details.type_name}\`)` : '';
  md.appendMarkdown(`**${name}**${typeName}\n\n`);
  if (details?.documentation) md.appendMarkdown(`${details.documentation}\n\n`);
  if (details?.compositor_context) {
    const c = details.compositor_context;
    md.appendMarkdown(`---\n**Context:** ${c.parent_compositor} in \`${c.parent_element}\`\n\n`);
  }
  const attrs = attrData?.attributes;
  if (attrs && attrs.length > 0) {
    md.appendMarkdown('---\n**Attributes:**\n\n');
    for (const a of attrs) {
      const req = a.use === 'required' ? ' \u2713 required' : '';
      const extra = a.fixed_value
        ? ` (fixed: "${a.fixed_value}")`
        : a.default_value
          ? ` (default: "${a.default_value}")`
          : '';
      const typeStr = a.type_name ? `: ${a.type_name}` : '';
      md.appendMarkdown(`- \`${a.name}\`${typeStr}${req}${extra}\n`);
    }
  }
  if (details?.enum_values && details.enum_values.length > 0) {
    md.appendMarkdown(
      `---\n**Enumeration values:** ${details.enum_values.map((v) => `\`${v}\``).join(', ')}\n`,
    );
  }
  return md;
}
