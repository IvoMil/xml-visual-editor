import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { CursorContext, CursorTrackingService } from './cursor-tracking-service';
import {
  callInsertRequiredChildren,
  handleInsertRequiredFallback,
} from './insert-required-operations';
import { TagAutoCloseService } from './tag-autoclose';

export class EditorOperations {
  private documentSyncTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly getEngineClient: () => EngineClient | undefined,
    private readonly getCursorTrackingService: () => CursorTrackingService | undefined,
    private readonly getLastCursorContext: () => CursorContext | undefined,
    private readonly getInsertRequiredMode: () => boolean,
    private readonly getAutoCloseService?: () => TagAutoCloseService | undefined,
  ) {}

  async handleInsertElement(insertName: string, compositorInsert?: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'xml') {
      return;
    }

    const ctx = this.getLastCursorContext();
    const engineClient = this.getEngineClient();

    // === Engine-based schema-ordered insertion ===
    if (engineClient?.isReady() && ctx?.schemaId && ctx.elementName && ctx.documentUri) {
      try {
        // Sync document first
        await engineClient.sendRequest('document.update', {
          doc_id: ctx.documentUri,
          content: editor.document.getText(),
        });

        // For context G (inside closing tag), element is a sibling — use parent's path
        const parentPath =
          ctx.cursorContext === 'G' ? ctx.elementPath.slice(0, -1) : ctx.elementPath;

        if (parentPath.length > 0) {
          const result = (await engineClient.sendRequest('helper.insertElement', {
            doc_id: ctx.documentUri,
            schema_id: ctx.schemaId,
            parent_path: parentPath,
            element_name: insertName,
            cursor_line: editor.selection.active.line,
          })) as {
            success?: boolean;
            content?: string;
            inserted_line?: number;
            inserted_column?: number;
          };

          if (result?.success && result.content != null) {
            this.getAutoCloseService?.()?.suppress();
            // Replace entire document
            const fullRange = new vscode.Range(
              new vscode.Position(0, 0),
              editor.document.lineAt(editor.document.lineCount - 1).range.end,
            );
            const wsEdit = new vscode.WorkspaceEdit();
            wsEdit.replace(editor.document.uri, fullRange, result.content);
            await vscode.workspace.applyEdit(wsEdit);

            // Position cursor inside the newly inserted element
            if (result.inserted_line != null && result.inserted_line >= 0) {
              const insertedLine = editor.document.lineAt(result.inserted_line);
              const lineText = insertedLine.text;
              const tagStart = lineText.indexOf(`<${insertName}`);
              if (tagStart >= 0) {
                const tagClose = lineText.indexOf('>', tagStart);
                if (tagClose >= 0) {
                  const pos = new vscode.Position(result.inserted_line, tagClose + 1);
                  editor.selection = new vscode.Selection(pos, pos);
                  editor.revealRange(
                    new vscode.Range(pos, pos),
                    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
                  );
                }
              }
            }

            // Sync updated content
            await engineClient.sendRequest('document.update', {
              doc_id: ctx.documentUri,
              content: editor.document.getText(),
            });

            // If Insert Required is ON, also insert required children
            if (this.getInsertRequiredMode()) {
              await this.callInsertRequired(
                insertName,
                parentPath,
                ctx.schemaId,
                ctx.documentUri,
                engineClient,
                editor,
                result.inserted_line,
                compositorInsert,
              );
            }

            this.getAutoCloseService?.()?.unsuppress();
            // Refresh panels and return focus
            this.getCursorTrackingService()?.forceRefresh();
            await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
            return;
          }
        }
      } catch (err) {
        this.getAutoCloseService?.()?.unsuppress();
        // If engine-based insertion fails, fall through to cursor-based insertion
        console.error('[XVE] Engine insert failed, falling back to cursor-based:', err);
      }
    }

    // === Fallback: cursor-based insertion ===
    if (
      this.getInsertRequiredMode() &&
      engineClient?.isReady() &&
      ctx?.schemaId &&
      ctx.elementName
    ) {
      await this.handleInsertRequired(insertName);
      return;
    }

    const cursorPos = editor.selection.active;

    // If cursor is inside a closing tag (context G), insert after the closing tag
    let insertPos = cursorPos;
    if (ctx?.cursorContext === 'G') {
      const lineText = editor.document.lineAt(cursorPos.line).text;
      const gtIndex = lineText.indexOf('>', cursorPos.character);
      if (gtIndex !== -1) {
        insertPos = new vscode.Position(cursorPos.line, gtIndex + 1);
      } else {
        for (let lineNum = cursorPos.line + 1; lineNum < editor.document.lineCount; lineNum++) {
          const nextLine = editor.document.lineAt(lineNum).text;
          const idx = nextLine.indexOf('>');
          if (idx !== -1) {
            insertPos = new vscode.Position(lineNum, idx + 1);
            break;
          }
        }
      }
    }

    // Check if element has required attributes (if engine is ready and schema loaded)
    let hasRequiredAttrs = false;
    if (engineClient?.isReady() && ctx?.schemaId && ctx.elementName) {
      try {
        const attrData = (await engineClient.sendRequest('helper.getAttributesPanelData', {
          schema_id: ctx.schemaId,
          element_name: insertName,
          element_path: [...ctx.elementPath, insertName],
          doc_id: ctx.documentUri,
        })) as { attributes?: Array<{ use?: string }> };

        if (attrData?.attributes) {
          hasRequiredAttrs = attrData.attributes.some((a) => a.use === 'required');
        }
      } catch {
        // If we can't determine, default to no required attrs
      }
    }

    // If cursor is inside an opening tag (context B/C/D), find the tag end
    // and handle self-closing element expansion
    if (ctx?.cursorContext === 'B' || ctx?.cursorContext === 'C' || ctx?.cursorContext === 'D') {
      let foundSelfClosing = false;
      let tagEndPos: vscode.Position | undefined;

      for (let lineNum = cursorPos.line; lineNum < editor.document.lineCount; lineNum++) {
        const lt = editor.document.lineAt(lineNum).text;
        const startChar = lineNum === cursorPos.line ? cursorPos.character : 0;
        for (let ch = startChar; ch < lt.length; ch++) {
          if (lt[ch] === '/' && ch + 1 < lt.length && lt[ch + 1] === '>') {
            foundSelfClosing = true;
            tagEndPos = new vscode.Position(lineNum, ch);
            break;
          }
          if (lt[ch] === '>') {
            tagEndPos = new vscode.Position(lineNum, ch + 1);
            break;
          }
        }
        if (tagEndPos) break;
      }

      if (tagEndPos) {
        if (foundSelfClosing) {
          const parentName = ctx.elementName ?? 'element';
          const tagLine = editor.document.lineAt(tagEndPos.line).text;
          const parentIndentMatch = tagLine.match(/^(\s*)/);
          const parentIndent = parentIndentMatch ? parentIndentMatch[1] : '';
          const childIndent = parentIndent + '  ';

          const slashGtRange = new vscode.Range(
            tagEndPos,
            new vscode.Position(tagEndPos.line, tagEndPos.character + 2),
          );

          let snippetText: string;
          if (hasRequiredAttrs) {
            snippetText = `>\n${childIndent}<${insertName} $1/>\n${parentIndent}</${parentName}>`;
          } else {
            snippetText = `>\n${childIndent}<${insertName}>$0</${insertName}>\n${parentIndent}</${parentName}>`;
          }

          await editor.insertSnippet(new vscode.SnippetString(snippetText), slashGtRange);

          if (engineClient?.isReady()) {
            try {
              await engineClient.sendRequest('document.update', {
                doc_id: editor.document.uri.toString(),
                content: editor.document.getText(),
              });
            } catch {
              // Ignore sync errors
            }
          }
          this.getCursorTrackingService()?.forceRefresh();
          await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
          return;
        } else {
          insertPos = tagEndPos;
        }
      }
    }

    // Determine indentation from the current line or surrounding lines
    const currentLine = editor.document.lineAt(insertPos.line);
    const indentMatch = currentLine.text.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1] : '';

    // Determine if we need a newline before the insert
    const lineText = currentLine.text.trim();
    let prefix = '';

    // If we're at the end of a line that has content, add a newline and matching indentation
    if (
      lineText.length > 0 &&
      insertPos.character >= lineText.length + currentLine.firstNonWhitespaceCharacterIndex
    ) {
      prefix = '\n' + indent;
    }

    let snippetText: string;
    if (hasRequiredAttrs) {
      snippetText = `${prefix}<${insertName} $1/>`;
    } else {
      snippetText = `${prefix}<${insertName}>$0</${insertName}>`;
    }

    await editor.insertSnippet(new vscode.SnippetString(snippetText), insertPos);

    // Post-insert: sync document to engine and refresh panels
    if (engineClient?.isReady()) {
      try {
        await engineClient.sendRequest('document.update', {
          doc_id: editor.document.uri.toString(),
          content: editor.document.getText(),
        });
      } catch {
        // Ignore sync errors
      }
    }

    // Force panel refresh
    this.getCursorTrackingService()?.forceRefresh();

    // Return focus to the editor
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }

  private async handleInsertRequired(insertName: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const engineClient = this.getEngineClient();
    if (!editor || editor.document.languageId !== 'xml' || !engineClient?.isReady()) {
      return;
    }

    const ctx = this.getLastCursorContext();
    if (!ctx?.schemaId || !ctx.elementName) {
      return;
    }

    await handleInsertRequiredFallback(insertName, editor, engineClient, ctx, () =>
      this.getCursorTrackingService()?.forceRefresh(),
    );
  }

  private async callInsertRequired(
    elementName: string,
    parentPath: string[],
    schemaId: string,
    docId: string,
    engineClient: EngineClient,
    editor: vscode.TextEditor,
    originalInsertedLine?: number,
    fillParent?: boolean,
  ): Promise<void> {
    await callInsertRequiredChildren(
      elementName,
      parentPath,
      schemaId,
      docId,
      engineClient,
      editor,
      originalInsertedLine,
      fillParent,
    );
  }

  async applyAttributeEdit(attrName: string, value: string, remove: boolean): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'xml') {
      return;
    }

    const doc = editor.document;
    const text = doc.getText();
    const offset = doc.offsetAt(editor.selection.active);

    // Find the opening tag containing the cursor
    let tagStart = -1;
    for (let i = offset; i >= 0; i--) {
      if (text[i] === '<' && i + 1 < text.length && text[i + 1] !== '/' && text[i + 1] !== '!') {
        tagStart = i;
        break;
      }
      if (text[i] === '>' && i < offset) {
        break;
      }
    }
    if (tagStart === -1) {
      return;
    }

    const tagEnd = text.indexOf('>', tagStart);
    if (tagEnd === -1) {
      return;
    }

    const tagText = text.substring(tagStart, tagEnd + 1);
    const escapedName = attrName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attrPattern = new RegExp(`(\\s)${escapedName}\\s*=\\s*(?:"[^"]*"|'[^']*')`);
    const match = attrPattern.exec(tagText);

    if (remove) {
      if (match) {
        const attrStart = tagStart + match.index;
        const attrEnd = attrStart + match[0].length;
        const range = new vscode.Range(doc.positionAt(attrStart), doc.positionAt(attrEnd));
        await editor.edit((eb) => eb.delete(range));
      }
    } else {
      const escapedValue = value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (match) {
        const attrStart = tagStart + match.index;
        const attrEnd = attrStart + match[0].length;
        const range = new vscode.Range(doc.positionAt(attrStart), doc.positionAt(attrEnd));
        await editor.edit((eb) => eb.replace(range, `${match[1]}${attrName}="${escapedValue}"`));
      } else {
        // Insert before > or />
        const selfClosing = tagText.endsWith('/>');
        const insertOffset = selfClosing ? tagEnd - 1 : tagEnd;
        const pos = doc.positionAt(insertOffset);
        await editor.edit((eb) => eb.insert(pos, ` ${attrName}="${escapedValue}"`));
      }
    }
  }

  scheduleDocumentSync(doc: vscode.TextDocument): void {
    const engineClient = this.getEngineClient();
    if (doc.languageId !== 'xml' || !engineClient?.isReady()) {
      return;
    }

    if (this.documentSyncTimer !== undefined) {
      clearTimeout(this.documentSyncTimer);
    }

    this.documentSyncTimer = setTimeout(() => {
      this.documentSyncTimer = undefined;
      void engineClient
        ?.sendRequest('document.update', {
          doc_id: doc.uri.toString(),
          content: doc.getText(),
        })
        .then(() => {
          // After syncing, refresh panels so they query with the latest document content.
          // Without this, panels would show stale attribute values until the next cursor move.
          this.getCursorTrackingService()?.forceRefresh();
        })
        .catch(() => {
          /* empty */
        });
    }, 300);
  }
}
