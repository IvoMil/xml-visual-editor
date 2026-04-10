import * as vscode from 'vscode';
import { getCompletionContext, type CompletionContext } from './xml-completion-context';
import type { EngineClient } from '../engine/engine-client';
import type { SchemaService } from '../services/schema-service';
import { markCursorPosition } from '../panels/elements-panel';
import {
  type ElementsPanelData,
  type AttributesPanelData,
  type ResolveData,
} from './xml-completion-types';
import { resolveCompletionItemData } from './completion-resolve';
import {
  stripPathIndex,
  flattenContentModel,
  buildHeaderItem,
  detectElementReplaceRange,
  detectAttributeValueRange,
  detectTextContentRange,
} from './completion-helpers';

export class XmlCompletionProvider implements vscode.CompletionItemProvider {
  private resolveDataMap = new Map<string, ResolveData>();

  constructor(
    private readonly engineClient: EngineClient,
    private readonly schemaService: SchemaService,
    private readonly getDocId: (uri: string) => string | undefined,
    private readonly getInsertRequiredActive: () => boolean,
  ) {}

  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    _context: vscode.CompletionContext,
  ): Promise<vscode.CompletionList | null> {
    if (document.uri.scheme !== 'file' || !this.engineClient.isReady()) {
      return null;
    }

    const docId = this.getDocId(document.uri.toString());
    if (!docId) {
      return null;
    }

    const schemaId = this.schemaService.getSchemaIdForDocument(document.uri.toString());
    if (!schemaId) {
      return null;
    }

    // Strip any partial element tag at cursor to give the engine clean XML for parsing.
    // This ensures instance counts are accurate even when the user is mid-typing.
    const fullText = document.getText();
    const cursorOffset = document.offsetAt(position);
    const textBeforeCursor = fullText.substring(0, cursorOffset);
    const partialTagMatch = textBeforeCursor.match(/<[a-zA-Z0-9_\-.:]*$/);
    const syncContent = partialTagMatch
      ? fullText.substring(0, cursorOffset - partialTagMatch[0].length) +
        fullText.substring(cursorOffset)
      : fullText;
    try {
      await this.engineClient.sendRequest('document.update', {
        doc_id: docId,
        content: syncContent,
      });
    } catch {
      /* empty */
    }

    if (token.isCancellationRequested) {
      return null;
    }

    const ctx = getCompletionContext(document, position);

    try {
      switch (ctx.type) {
        case 'element-content':
          return await this.getElementCompletions(docId, schemaId, ctx, position, document, token);
        case 'tag-open': {
          const elementPath = ctx.elementName
            ? [...ctx.parentPath, ctx.elementName]
            : ctx.parentPath;
          return await this.getAttributeNameCompletions(docId, schemaId, elementPath, token);
        }
        case 'attribute-value': {
          const elementPath = ctx.elementName
            ? [...ctx.parentPath, ctx.elementName]
            : ctx.parentPath;
          return await this.getAttributeValueCompletions(
            docId,
            schemaId,
            elementPath,
            ctx.attributeName ?? '',
            token,
            document,
            position,
          );
        }
        case 'text-content':
          return await this.getTextContentCompletions(
            docId,
            schemaId,
            ctx.parentPath,
            token,
            document,
            position,
          );
        default:
          return null;
      }
    } catch (err) {
      console.error('[XVE] Completion error:', err);
      return null;
    }
  }

  async resolveCompletionItem(
    item: vscode.CompletionItem,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionItem> {
    return resolveCompletionItemData(this.engineClient, this.resolveDataMap, item, token);
  }

  private async getElementCompletions(
    docId: string,
    schemaId: string,
    ctx: CompletionContext,
    position: vscode.Position,
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionList | null> {
    const parentPath = ctx.parentPath;
    if (parentPath.length === 0) {
      return null;
    }

    const result = (await this.engineClient.sendRequest('helper.getElementsPanelData', {
      schema_id: schemaId,
      element_name: stripPathIndex(parentPath[parentPath.length - 1]),
      element_path: parentPath,
      doc_id: docId,
    })) as ElementsPanelData;

    if (token.isCancellationRequested) {
      return null;
    }

    if (!result?.content_model || result.content_model.length === 0) {
      return null;
    }

    if (ctx.precedingSibling && result.content_model.length > 0) {
      markCursorPosition(result.content_model, ctx.precedingSibling);
    }

    this.resolveDataMap.clear();
    const allEntries = flattenContentModel(result.content_model, 0);

    const filtered = allEntries.filter((entry) => {
      if (entry.type !== 'element') return true;
      const n = entry.node;
      // Rule 1: ALWAYS hide inactive branch elements
      if (entry.isInactiveBranch) return false;
      // Rule 2: Before cursor and not cursor-adjacent
      if (n.before_cursor && !n.cursor_adjacent) {
        // Rule 2a: Hide active-branch exhausted elements before cursor
        if (n.is_exhausted) return false;
        // Rule 2b: Show active choice group elements that can still accept instances
        if (entry.inChoiceGroup && entry.parentChoiceNode?.cursor_adjacent) return true;
        // Rule 2c: Hide other before-cursor elements (can't insert here)
        return false;
      }
      // Rule 3: After cursor / cursor-adjacent — show everything (incl. exhausted as "(present)")
      return true;
    });
    // Remove headers with no remaining element children
    const flat = filtered.filter((entry, idx) => {
      if (entry.type !== 'choice_header' && entry.type !== 'sequence_header') return true;
      const headerDepth = entry.depth;
      for (let i = idx + 1; i < filtered.length; i++) {
        const next = filtered[i];
        // Only stop at headers at the same or shallower depth (sibling/parent level)
        if (
          (next.type === 'choice_header' || next.type === 'sequence_header') &&
          next.depth <= headerDepth
        ) {
          break;
        }
        if (next.type === 'element' && next.depth > headerDepth) return true;
      }
      return false;
    });
    const replaceRange = detectElementReplaceRange(document, position);
    const allNames = flat.filter((e) => e.type === 'element').map((e) => e.name);
    const allNamesFilter = allNames.join(' ');

    const items: vscode.CompletionItem[] = [];

    // Toggle item
    const insertReqActive = this.getInsertRequiredActive();
    const toggleLabel = insertReqActive ? '\u26A1 Insert + required: ON' : 'Insert + required: OFF';
    const toggleItem = new vscode.CompletionItem(
      { label: toggleLabel, description: 'toggle' },
      vscode.CompletionItemKind.Event,
    );
    toggleItem.sortText = '!00000';
    toggleItem.filterText = replaceRange ? allNames.map((n) => '<' + n).join(' ') : allNamesFilter;
    toggleItem.command = {
      command: 'xmlVisualEditor.toggleInsertRequired',
      title: 'Toggle Insert Required',
    };
    if (replaceRange) {
      toggleItem.insertText = '<';
      toggleItem.range = replaceRange;
    } else {
      toggleItem.insertText = '';
    }
    items.push(toggleItem);

    for (const entry of flat) {
      if (entry.type === 'choice_header' || entry.type === 'sequence_header') {
        items.push(buildHeaderItem(entry, replaceRange, parentPath, schemaId, docId));
        continue;
      }

      const name = entry.name;
      const node = entry.node;
      const maxStr = node.max_occurs === 'unbounded' ? '\u221E' : String(node.max_occurs);
      const cardinality = `${node.min_occurs}..${maxStr}`;

      let description: string;
      const tags: vscode.CompletionItemTag[] = [];

      if (node.is_exhausted) {
        description = `\u2713 ${cardinality} (present)`;
      } else if (node.current_count > 0) {
        const remaining =
          node.max_occurs === 'unbounded' ? '\u221E' : String(node.max_occurs - node.current_count);
        description = `\u2713 ${cardinality} (${remaining} left)`;
      } else if (node.min_occurs > 0) {
        description = `${cardinality} (required)`;
      } else {
        description = cardinality;
      }

      const indent = '\u00A0\u00A0'.repeat(entry.depth);
      const icon = '<>';
      const label = `${indent}${icon} ${name}`;
      const elemItem = new vscode.CompletionItem(
        { label, description },
        vscode.CompletionItemKind.Field,
      );
      if (tags.length > 0) elemItem.tags = tags;
      elemItem.detail = cardinality;
      if (node.documentation) {
        elemItem.documentation = new vscode.MarkdownString(node.documentation);
      } else {
        const typeInfo = node.type_name ? ` (\`${node.type_name}\`)` : '';
        elemItem.documentation = new vscode.MarkdownString(`**${name}**${typeInfo}`);
      }
      const orderStr = String(entry.schemaOrder).padStart(5, '0');
      elemItem.sortText = '1' + orderStr;
      // Don't insert any text — the command will handle everything via the engine
      elemItem.insertText = '';
      elemItem.command = {
        command: 'xmlVisualEditor.completionInsertElement',
        title: 'Insert Element',
        arguments: [name, parentPath, schemaId, docId],
      };
      elemItem.filterText = replaceRange ? '<' + name : name;
      if (replaceRange) elemItem.range = replaceRange;
      const resolveKey = `${label}::${cardinality}`;
      this.resolveDataMap.set(resolveKey, { elementName: name, parentPath, schemaId, docId });
      items.push(elemItem);
    }

    const commentItem = new vscode.CompletionItem(
      '<!-- Comment -->',
      vscode.CompletionItemKind.Snippet,
    );
    commentItem.detail = 'Insert XML comment';
    commentItem.sortText = 'z99999';
    commentItem.filterText = replaceRange ? '<comment' : 'comment';
    commentItem.insertText = new vscode.SnippetString('<!-- $1 -->');
    if (replaceRange) commentItem.range = replaceRange;
    items.push(commentItem);

    return new vscode.CompletionList(items, true);
  }

  private async getAttributeNameCompletions(
    docId: string,
    schemaId: string,
    elementPath: string[],
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionList | null> {
    if (elementPath.length === 0) {
      return null;
    }

    const result = (await this.engineClient.sendRequest('helper.getAttributesPanelData', {
      schema_id: schemaId,
      element_name: stripPathIndex(elementPath[elementPath.length - 1]),
      element_path: elementPath,
      doc_id: docId,
    })) as AttributesPanelData;

    if (token.isCancellationRequested) {
      return null;
    }

    if (!result?.attributes || result.attributes.length === 0) {
      return null;
    }

    const available = result.attributes.filter((a) => !a.is_set);
    if (available.length === 0) return null;
    const items = available.map((attr) => {
      const isReq = attr.use === 'required';
      const item = new vscode.CompletionItem(attr.name, vscode.CompletionItemKind.Property);
      item.label = { label: attr.name, description: isReq ? '@ (required)' : '@ (optional)' };
      if (attr.type_name) item.detail = attr.type_name;
      if (attr.documentation) item.documentation = new vscode.MarkdownString(attr.documentation);
      item.sortText = (isReq ? '0' : '1') + attr.name;
      item.insertText = new vscode.SnippetString(`${attr.name}="$1"`);
      item.command = { command: 'editor.action.triggerSuggest', title: 'Re-trigger completions' };
      return item;
    });

    return new vscode.CompletionList(items, true);
  }

  private async getAttributeValueCompletions(
    docId: string,
    schemaId: string,
    elementPath: string[],
    attributeName: string,
    token: vscode.CancellationToken,
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionList | null> {
    if (elementPath.length === 0 || !attributeName) {
      return null;
    }

    const result = (await this.engineClient.sendRequest('helper.getAttributesPanelData', {
      schema_id: schemaId,
      element_name: stripPathIndex(elementPath[elementPath.length - 1]),
      element_path: elementPath,
      doc_id: docId,
    })) as AttributesPanelData;

    if (token.isCancellationRequested) {
      return null;
    }

    const attr = result?.attributes?.find((a) => a.name === attributeName);
    if (!attr?.enum_values || attr.enum_values.length === 0) {
      return null;
    }

    const replaceRange = detectAttributeValueRange(document, position);
    const currentValue = replaceRange ? document.getText(replaceRange) : '';

    const items = attr.enum_values.map((value, idx) => {
      const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
      item.sortText = String(idx).padStart(5, '0');
      if (replaceRange) item.range = replaceRange;
      if (value === currentValue) item.preselect = true;
      return item;
    });
    return new vscode.CompletionList(items, true);
  }

  private async getTextContentCompletions(
    docId: string,
    schemaId: string,
    elementPath: string[],
    token: vscode.CancellationToken,
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CompletionList | null> {
    if (elementPath.length === 0) {
      return null;
    }

    const elementName = stripPathIndex(elementPath[elementPath.length - 1]);

    // Use helper.getNodeDetails for path-based resolution (handles name-ambiguous elements)
    let values: string[] = [];
    let typeName: string | undefined;
    try {
      const details = (await this.engineClient.sendRequest('helper.getNodeDetails', {
        schema_id: schemaId,
        element_name: elementName,
        element_path: elementPath,
        doc_id: docId,
      })) as { type_name?: string; enum_values?: string[] };
      typeName = details?.type_name;
      values = details?.enum_values ?? [];
    } catch {
      return null;
    }

    if (token.isCancellationRequested) {
      return null;
    }

    if (values.length === 0) {
      // Fallback for built-in boolean type
      if (typeName && (typeName === 'boolean' || typeName.endsWith(':boolean'))) {
        values = ['true', 'false'];
      } else {
        return null;
      }
    }

    const replaceRange = detectTextContentRange(document, position);
    const items = values.map((value, idx) => {
      const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
      item.sortText = String(idx).padStart(5, '0');
      if (replaceRange) item.range = replaceRange;
      return item;
    });

    return new vscode.CompletionList(items, true);
  }
}
