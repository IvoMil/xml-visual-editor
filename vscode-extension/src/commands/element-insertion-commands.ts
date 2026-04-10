import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { CursorTrackingService } from '../services/cursor-tracking-service';
import { TagAutoCloseService } from '../services/tag-autoclose';
import { repositionCursorToElement } from '../utils/cursor-reposition';
import { stripXmlComments } from '../utils/xml-cursor-helpers';

/**
 * Computes the indexed element name (e.g. "foo[2]") for the element that was
 * just inserted at the cursor position, by counting how many siblings of the
 * same name appear before the cursor within the parent element's content.
 */
function computeElementIndex(
  docText: string,
  parentPath: string[],
  elementName: string,
  cursorOffset: number,
): string {
  // Strip XML comment content so tags inside comments are not counted
  const cleanText = stripXmlComments(docText);
  let parentContentStart = 0;
  for (const segment of parentPath) {
    const segMatch = segment.match(/^(.+?)(?:\[(\d+)\])?$/);
    if (!segMatch) break;
    const segName = segMatch[1];
    const segIndex = segMatch[2] ? parseInt(segMatch[2]) : 1;
    const segEscaped = segName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const segRegex = new RegExp(`<${segEscaped}[\\s/>]`, 'g');
    segRegex.lastIndex = parentContentStart;
    let found = 0;
    let segResult: RegExpExecArray | null;
    while ((segResult = segRegex.exec(cleanText)) !== null) {
      found++;
      if (found === segIndex) {
        parentContentStart = segResult.index + segResult[0].length;
        break;
      }
    }
    if (found < segIndex) break;
  }

  const parentContent = cleanText.substring(parentContentStart, cursorOffset);
  const escaped = elementName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRegex = new RegExp(`<${escaped}[\\s/>]`, 'g');
  let count = 0;
  while (tagRegex.exec(parentContent) !== null) {
    count++;
  }
  return count > 1 ? `${elementName}[${count}]` : elementName;
}

export function registerElementInsertionCommands(
  context: vscode.ExtensionContext,
  getEngine: () => EngineClient | undefined,
  getCursorTracking: () => CursorTrackingService | undefined,
  getInsertRequiredMode: () => boolean,
  getAutoCloseService?: () => TagAutoCloseService | undefined,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'xmlVisualEditor.completionInsertRequired',
      async (elementName: string, parentPath: string[], schemaId: string, docId: string) => {
        // Wait for VS Code to finalize the completion edit
        await new Promise((resolve) => setTimeout(resolve, 100));

        const editor = vscode.window.activeTextEditor;
        const engine = getEngine();
        if (!editor || !engine || !engine.isReady()) {
          return;
        }

        // Sync document
        try {
          await engine.sendRequest('document.update', {
            doc_id: docId,
            content: editor.document.getText(),
          });
        } catch {
          /* ignore sync errors */
        }

        // Determine indexed path for the just-inserted element
        const docText = editor.document.getText();
        const cursorOffset = editor.document.offsetAt(editor.selection.active);
        const indexedName = computeElementIndex(docText, parentPath, elementName, cursorOffset);
        const elementPath = [...parentPath, indexedName];

        getAutoCloseService?.()?.suppress();
        try {
          const savedLine = editor.selection.active.line;
          const result = (await engine.sendRequest('helper.insertRequiredChildren', {
            doc_id: docId,
            schema_id: schemaId,
            element_path: elementPath,
          })) as { success?: boolean; new_content?: string; total_inserted?: number };

          if (result?.success && result.new_content) {
            const fullRange = new vscode.Range(
              new vscode.Position(0, 0),
              editor.document.lineAt(editor.document.lineCount - 1).range.end,
            );
            const wsEdit = new vscode.WorkspaceEdit();
            wsEdit.replace(editor.document.uri, fullRange, result.new_content);
            await vscode.workspace.applyEdit(wsEdit);

            // Reposition cursor at the inserted element
            repositionCursorToElement(editor, elementName, savedLine);

            // Sync again
            await engine.sendRequest('document.update', {
              doc_id: editor.document.uri.toString(),
              content: editor.document.getText(),
            });

            if (result.total_inserted && result.total_inserted > 0) {
              vscode.window.setStatusBarMessage(
                `Inserted ${result.total_inserted} required element(s)`,
                3000,
              );
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Insert Required failed: ${message}`);
        } finally {
          getAutoCloseService?.()?.unsuppress();
        }

        // Refresh panels and return focus
        getCursorTracking()?.forceRefresh();
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      },
    ),

    vscode.commands.registerCommand(
      'xmlVisualEditor.completionInsertElement',
      async (
        elementName: string,
        parentPath: string[],
        schemaId: string,
        docId: string,
        compositorInsert?: boolean,
      ) => {
        // Wait for VS Code to finalize the completion edit (removes partial tag)
        await new Promise((resolve) => setTimeout(resolve, 100));

        const editor = vscode.window.activeTextEditor;
        const engine = getEngine();
        if (!editor || !engine || !engine.isReady()) {
          return;
        }

        // Sync document to engine
        try {
          await engine.sendRequest('document.update', {
            doc_id: docId,
            content: editor.document.getText(),
          });
        } catch {
          /* ignore sync errors */
        }

        getAutoCloseService?.()?.suppress();
        try {
          // Call engine to insert element at schema-correct position
          const result = (await engine.sendRequest('helper.insertElement', {
            doc_id: docId,
            schema_id: schemaId,
            parent_path: parentPath,
            element_name: elementName,
            cursor_line: editor.selection.active.line,
          })) as {
            success?: boolean;
            content?: string;
            inserted_line?: number;
            inserted_column?: number;
          };

          if (result?.success && result.content != null) {
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
              const tagStart = lineText.indexOf(`<${elementName}`);
              if (tagStart >= 0) {
                const selfClose = lineText.indexOf('/>', tagStart);
                const tagClose = lineText.indexOf('>', tagStart);
                if (selfClose >= 0 && selfClose === tagClose - 1) {
                  const pos = new vscode.Position(result.inserted_line, selfClose + 2);
                  editor.selection = new vscode.Selection(pos, pos);
                  editor.revealRange(
                    new vscode.Range(pos, pos),
                    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
                  );
                } else if (tagClose >= 0) {
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
            await engine.sendRequest('document.update', {
              doc_id: docId,
              content: editor.document.getText(),
            });

            // If Insert Required mode is ON, also insert required children
            if (getInsertRequiredMode()) {
              const savedInsertedLine = result.inserted_line ?? editor.selection.active.line;
              const docText = editor.document.getText();
              const cursorOffset = editor.document.offsetAt(editor.selection.active);
              const indexedName = computeElementIndex(
                docText,
                parentPath,
                elementName,
                cursorOffset,
              );
              const elementPath = compositorInsert ? parentPath : [...parentPath, indexedName];

              try {
                const reqResult = (await engine.sendRequest('helper.insertRequiredChildren', {
                  doc_id: docId,
                  schema_id: schemaId,
                  element_path: elementPath,
                })) as { success?: boolean; new_content?: string; total_inserted?: number };

                if (reqResult?.success && reqResult.new_content) {
                  const fullRange2 = new vscode.Range(
                    new vscode.Position(0, 0),
                    editor.document.lineAt(editor.document.lineCount - 1).range.end,
                  );
                  const wsEdit2 = new vscode.WorkspaceEdit();
                  wsEdit2.replace(editor.document.uri, fullRange2, reqResult.new_content);
                  await vscode.workspace.applyEdit(wsEdit2);

                  // Reposition cursor at the inserted element
                  repositionCursorToElement(editor, elementName, savedInsertedLine);

                  // Final sync
                  await engine.sendRequest('document.update', {
                    doc_id: docId,
                    content: editor.document.getText(),
                  });

                  if (reqResult.total_inserted && reqResult.total_inserted > 0) {
                    vscode.window.setStatusBarMessage(
                      `Inserted ${reqResult.total_inserted} required element(s)`,
                      3000,
                    );
                  }
                }
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                void vscode.window.showErrorMessage(`Insert Required Children failed: ${message}`);
              }
            }
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          void vscode.window.showErrorMessage(`Insert Element failed: ${message}`);
        } finally {
          getAutoCloseService?.()?.unsuppress();
        }

        // Refresh panels and return focus
        getCursorTracking()?.forceRefresh();
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      },
    ),
  );
}
