import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { repositionCursorToElement } from '../utils/cursor-reposition';
import { stripXmlComments } from '../utils/xml-cursor-helpers';
import { CursorContext } from './cursor-tracking-service';

/**
 * Fallback insert-required logic used when engine-based schema-ordered insertion
 * is not available. Inserts an element at the cursor, then asks the engine to
 * fill in required children.
 */
export async function handleInsertRequiredFallback(
  insertName: string,
  editor: vscode.TextEditor,
  engineClient: EngineClient,
  ctx: CursorContext,
  refreshPanels: () => void,
): Promise<void> {
  try {
    // Step 1: Insert the element first (simple insert at cursor)
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

    // If cursor is inside an opening tag (context B/C/D), find the tag end
    // and handle self-closing element expansion
    let skipInitialInsert = false;
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

          const expandText = `>\n${childIndent}<${insertName}></${insertName}>\n${parentIndent}</${parentName}>`;
          await editor.edit((eb) => {
            eb.replace(slashGtRange, expandText);
          });
          skipInitialInsert = true;
        } else {
          insertPos = tagEndPos;
        }
      }
    }

    if (!skipInitialInsert) {
      const currentLine = editor.document.lineAt(insertPos.line);
      const indentMatch = currentLine.text.match(/^(\s*)/);
      const indent = indentMatch ? indentMatch[1] : '';

      const lineText = currentLine.text.trim();
      let prefix = '';
      if (
        lineText.length > 0 &&
        insertPos.character >= currentLine.firstNonWhitespaceCharacterIndex + lineText.length
      ) {
        prefix = '\n' + indent;
      }

      const insertText = prefix + `<${insertName}></${insertName}>`;
      await editor.edit((eb) => {
        eb.insert(insertPos, insertText);
      });
    }

    // Step 2: Sync document to engine
    await engineClient.sendRequest('document.update', {
      doc_id: editor.document.uri.toString(),
      content: editor.document.getText(),
    });

    // Step 3: Determine correct indexed path for the newly inserted element
    const docText = editor.document.getText();
    const cleanText = stripXmlComments(docText);
    const cursorOffset = editor.document.offsetAt(editor.selection.active);
    const beforeCursor = cleanText.substring(0, cursorOffset);
    const tagRegex = new RegExp(
      `<${insertName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s/>]`,
      'g',
    );
    let count = 0;
    while (tagRegex.exec(beforeCursor) !== null) {
      count++;
    }
    const indexedName = count > 1 ? `${insertName}[${count}]` : insertName;
    // Context G: element was inserted as a sibling (after closing tag),
    // so path is relative to parent, not the current element
    const basePath = ctx.cursorContext === 'G' ? ctx.elementPath.slice(0, -1) : ctx.elementPath;
    const elementPath = [...basePath, indexedName];
    const result = (await engineClient.sendRequest('helper.insertRequiredChildren', {
      doc_id: ctx.documentUri,
      schema_id: ctx.schemaId,
      element_path: elementPath,
    })) as { success?: boolean; new_content?: string; total_inserted?: number };

    if (result?.success && result.new_content) {
      // Step 4: Replace document content with the result
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        editor.document.lineAt(editor.document.lineCount - 1).range.end,
      );
      const wsEdit = new vscode.WorkspaceEdit();
      wsEdit.replace(editor.document.uri, fullRange, result.new_content);
      await vscode.workspace.applyEdit(wsEdit);

      // Reposition cursor at the inserted element
      repositionCursorToElement(editor, insertName, insertPos.line);

      // Step 5: Sync again
      await engineClient.sendRequest('document.update', {
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

    // Step 6: Refresh panels
    refreshPanels();

    // Return focus to the editor
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void vscode.window.showErrorMessage(`Insert Required failed: ${message}`);
  }
}

/**
 * Called after engine-based schema-ordered insertion to also insert required
 * children of the newly inserted element. Traverses the document to build
 * the correct indexed path, then asks the engine to fill in required children.
 */
export async function callInsertRequiredChildren(
  elementName: string,
  parentPath: string[],
  schemaId: string,
  docId: string,
  engineClient: EngineClient,
  editor: vscode.TextEditor,
  originalInsertedLine?: number,
  fillParent?: boolean,
): Promise<void> {
  const docText = editor.document.getText();
  const cleanText = stripXmlComments(docText);
  const cursorOffset = editor.document.offsetAt(editor.selection.active);

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
  const indexedName = count > 1 ? `${elementName}[${count}]` : elementName;
  const elementPath = fillParent ? parentPath : [...parentPath, indexedName];

  try {
    const reqResult = (await engineClient.sendRequest('helper.insertRequiredChildren', {
      doc_id: docId,
      schema_id: schemaId,
      element_path: elementPath,
    })) as { success?: boolean; new_content?: string; total_inserted?: number };

    if (reqResult?.success && reqResult.new_content) {
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        editor.document.lineAt(editor.document.lineCount - 1).range.end,
      );
      const wsEdit = new vscode.WorkspaceEdit();
      wsEdit.replace(editor.document.uri, fullRange, reqResult.new_content);
      await vscode.workspace.applyEdit(wsEdit);

      // Reposition cursor at the originally inserted element
      if (originalInsertedLine != null && originalInsertedLine >= 0) {
        repositionCursorToElement(editor, elementName, originalInsertedLine);
      }

      // Sync again
      await engineClient.sendRequest('document.update', {
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
