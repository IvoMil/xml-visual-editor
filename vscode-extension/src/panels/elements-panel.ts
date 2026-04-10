import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { CursorContext } from '../services/cursor-tracking-service';
import {
  getStyles,
  getElementsScript,
  getTableHtml,
  buildContentModelRows,
  RowBuilderState,
  ContentModelNode,
} from '../shared/schema-table-renderer';
import { getPanelFontCss, getXmlTokenColors } from '../shared/panel-utils';
import {
  markCursorPosition,
  computeFocusedChild,
  extractSimpleTextContent,
} from './elements-cursor-utils';

export {
  markCursorPosition,
  computeFocusedChild,
  nodeContainsElement,
  markSubtreeBeforeCursor,
  markCursorPositionInBranch,
  extractSimpleTextContent,
} from './elements-cursor-utils';

interface ElementsPanelData {
  anchor_element: string | null;
  anchor_path: string[];
  content_model: ContentModelNode[];
  content_complete: boolean;
  missing_required: string[];
  focused_child?: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class ElementsPanelProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private lastContext: CursorContext | undefined;
  private updateGeneration = 0;

  private readonly _onElementSelected = new vscode.EventEmitter<{
    name: string;
    schemaId: string;
  }>();
  readonly onElementSelected: vscode.Event<{ name: string; schemaId: string }> =
    this._onElementSelected.event;

  private readonly _onInsertElement = new vscode.EventEmitter<{
    name: string;
    compositorInsert: boolean;
  }>();
  readonly onInsertElement: vscode.Event<{ name: string; compositorInsert: boolean }> =
    this._onInsertElement.event;

  private readonly _onFocusedChildChanged = new vscode.EventEmitter<{
    name: string;
    schemaId: string;
    parentPath: string[];
  } | null>();
  readonly onFocusedChildChanged = this._onFocusedChildChanged.event;

  private readonly _onRequestRefresh = new vscode.EventEmitter<void>();
  readonly onRequestRefresh: vscode.Event<void> = this._onRequestRefresh.event;

  constructor(private readonly engineClient: EngineClient) {}

  setInsertMode(_active: boolean): void {
    // Toggle text is shown via view/title menu commands in package.json
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getSkeletonHtml();

    webviewView.webview.onDidReceiveMessage(
      (message: {
        type: string;
        name?: string;
        nodeType?: string;
        value?: string;
        compositorInsert?: boolean;
      }) => {
        switch (message.type) {
          case 'selectNode':
            if (message.name && message.nodeType === 'element' && this.lastContext?.schemaId) {
              this._onElementSelected.fire({
                name: message.name,
                schemaId: this.lastContext.schemaId,
              });
            }
            break;
          case 'insertElement':
            if (message.name) {
              this._onInsertElement.fire({
                name: message.name,
                compositorInsert: !!message.compositorInsert,
              });
            }
            break;
          case 'selectEnumValue':
            if (message.value !== undefined) {
              void this.applyEnumValueEdit(message.value);
            }
            break;
        }
      },
    );

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this.lastContext) {
        void this.update(this.lastContext);
      }
    });

    // If a cursor context was received before the view was ready, update now
    if (this.lastContext) {
      void this.update(this.lastContext);
    }
  }

  async update(context: CursorContext): Promise<void> {
    const generation = ++this.updateGeneration;
    this.lastContext = context;

    if (!this.view) {
      return;
    }

    if (!context.schemaId) {
      void this.view.webview.postMessage({
        type: 'updateContent',
        html: '<div class="empty-state">No schema loaded</div>',
      });
      return;
    }

    if (!context.elementName) {
      void this.view.webview.postMessage({
        type: 'updateContent',
        html: '<div class="empty-state">No element at cursor</div>',
      });
      return;
    }

    if (!this.engineClient.isReady()) {
      void this.view.webview.postMessage({
        type: 'updateContent',
        html: '<div class="empty-state">Engine not ready</div>',
      });
      return;
    }

    // Show loading spinner
    void this.view.webview.postMessage({
      type: 'updateContent',
      html: '<div class="empty-state"><span class="loading">Loading elements...</span></div>',
    });

    try {
      const result = (await this.engineClient.sendRequest(
        'helper.getElementsPanelData',
        {
          schema_id: context.schemaId,
          element_name: context.elementName,
          element_path: context.elementPath,
          doc_id: context.documentUri,
        },
        30000,
      )) as ElementsPanelData;

      if (generation !== this.updateGeneration) return; // superseded by newer update

      if (!result?.content_model || result.content_model.length === 0) {
        // Try to fetch enumeration values (works for simple-type elements)
        const enumHtml = await this.getEnumValuesHtml(context);
        if (generation !== this.updateGeneration) return;
        if (enumHtml) {
          void this.view.webview.postMessage({ type: 'updateContent', html: enumHtml });
          return;
        }

        let msg: string;
        if (!result?.content_model) {
          msg = `&lt;${escapeHtml(context.elementName)}&gt; has simple content (text only). Use the Attributes panel to edit attributes.`;
        } else if (result.content_model.length === 0) {
          msg = `&lt;${escapeHtml(context.elementName)}&gt; has no child elements. Use the Attributes panel to edit attributes.`;
        } else {
          msg = `No child elements defined for &lt;${escapeHtml(context.elementName)}&gt;.`;
        }
        void this.view.webview.postMessage({
          type: 'updateContent',
          html: `<div class="empty-state">${msg}</div>`,
        });
        return;
      }

      // Mark cursor position on content model nodes
      const precedingSibling = context.precedingSiblingName;
      if (
        precedingSibling &&
        (context.cursorContext === 'F' || context.cursorContext === 'G') &&
        result.content_model.length > 0
      ) {
        markCursorPosition(result.content_model, precedingSibling);
      }

      const state: RowBuilderState = { rowIndex: 0 };
      const focused = computeFocusedChild(
        result.content_model,
        precedingSibling,
        context.cursorContext,
      );

      if (focused && context.schemaId) {
        this._onFocusedChildChanged.fire({
          name: focused,
          schemaId: context.schemaId,
          parentPath: context.elementPath,
        });
      } else {
        this._onFocusedChildChanged.fire(null);
      }

      let rows = '';
      for (const entry of result.content_model) {
        rows += buildContentModelRows(entry, 0, state, 10, true, undefined, focused);
      }

      const html = getTableHtml(rows, {
        v2Mode: true,
        showFilter: true,
      });

      void this.view.webview.postMessage({ type: 'updateContent', html });
    } catch (err) {
      if (generation !== this.updateGeneration) return; // superseded
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timed out');
      void this.view.webview.postMessage({
        type: 'updateContent',
        html: `<div class="empty-state${isTimeout ? '' : ' error'}">${isTimeout ? '⏳ ' : ''}${escapeHtml(message)}${isTimeout ? '. Data may still be loading — try moving cursor again.' : ''}</div>`,
      });
    }
  }

  private async getEnumValuesHtml(context: CursorContext): Promise<string | null> {
    if (!context.schemaId || !context.elementName || !this.engineClient.isReady()) {
      return null;
    }

    try {
      // Use helper.getNodeDetails which does path-based resolution (handles name collisions)
      const details = (await this.engineClient.sendRequest('helper.getNodeDetails', {
        schema_id: context.schemaId,
        element_name: context.elementName,
        element_path: context.elementPath,
        doc_id: context.documentUri,
      })) as { type_name?: string; enum_values?: string[] };

      const typeName = details?.type_name;
      let values = details?.enum_values ?? [];
      if (values.length === 0) {
        // Built-in boolean type: provide true/false choices
        if (typeName && (typeName === 'boolean' || typeName.endsWith(':boolean'))) {
          values = ['true', 'false'];
        } else {
          return null;
        }
      }

      // Extract current text content from document
      const currentValue = this.extractTextContent(context);

      // Build HTML list
      const header = `<div class="enum-header">&lt;${escapeHtml(context.elementName)}&gt; allowed values:</div>`;
      const items = values
        .map((val) => {
          const isSelected = val === currentValue;
          const bullet = isSelected
            ? '<span class="enum-ind-set">\u25CF</span>'
            : '<span class="enum-ind">\u25CB</span>';
          const cls = isSelected ? 'enum-value selected' : 'enum-value';
          return `<div class="${cls}" data-value="${escapeHtml(val)}" style="cursor:pointer">${bullet} ${escapeHtml(val)}</div>`;
        })
        .join('\n');

      return `<div class="enum-values">${header}\n${items}</div>`;
    } catch {
      return null;
    }
  }

  private extractTextContent(context: CursorContext): string {
    return extractSimpleTextContent(
      context.documentText,
      context.cursorOffset,
      context.elementName ?? '',
    );
  }

  private async applyEnumValueEdit(value: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.lastContext?.elementName) return;

    const doc = editor.document;
    const text = doc.getText();
    const offset = doc.offsetAt(editor.selection.active);
    const elementName = this.lastContext.elementName;

    const openTag = '<' + elementName;
    let tagStart = -1;
    for (let i = Math.min(offset, text.length - 1); i >= 0; i--) {
      if (text[i] === '<') {
        if (i + 1 < text.length && text[i + 1] === '/') continue;
        if (text.startsWith(openTag, i)) {
          const afterName = i + openTag.length;
          if (
            afterName >= text.length ||
            text[afterName] === ' ' ||
            text[afterName] === '>' ||
            text[afterName] === '/' ||
            text[afterName] === '\t' ||
            text[afterName] === '\n' ||
            text[afterName] === '\r'
          ) {
            tagStart = i;
            break;
          }
        }
        break;
      }
    }
    if (tagStart === -1) return;

    let gtPos = -1;
    for (let i = tagStart + openTag.length; i < text.length; i++) {
      if (text[i] === '>') {
        if (i > 0 && text[i - 1] === '/') return;
        gtPos = i;
        break;
      }
    }
    if (gtPos === -1) return;

    const closeTagStart = text.indexOf('</' + elementName, gtPos + 1);
    if (closeTagStart === -1) return;

    const startPos = doc.positionAt(gtPos + 1);
    const endPos = doc.positionAt(closeTagStart);

    await editor.edit((editBuilder) => {
      editBuilder.replace(new vscode.Range(startPos, endPos), value);
    });
    this._onRequestRefresh.fire();
  }

  sendMessage(message: Record<string, unknown>): void {
    if (this.view) {
      void this.view.webview.postMessage(message);
    }
  }

  sendColors(): void {
    if (this.view) {
      const colors = getXmlTokenColors();
      void this.view.webview.postMessage({
        type: 'updateColors',
        tagColor: colors.tagColor,
        attrColor: colors.attrColor,
      });
    }
  }

  dispose(): void {
    this._onElementSelected.dispose();
    this._onInsertElement.dispose();
    this._onFocusedChildChanged.dispose();
    this._onRequestRefresh.dispose();
  }

  private getSkeletonHtml(): string {
    const colors = getXmlTokenColors();
    const styles = getStyles({ tagColor: colors.tagColor, attrColor: colors.attrColor });
    const script = getElementsScript();
    const fontCss = getPanelFontCss();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>${styles}</style>
  <style>${fontCss}</style>
</head>
<body>
  <div id="contentRoot"><div class="empty-state">Open an XML file to see allowed elements</div></div>
  <script>${script}</script>
</body>
</html>`;
  }
}
