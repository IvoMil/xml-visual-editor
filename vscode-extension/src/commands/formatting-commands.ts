import * as vscode from 'vscode';
import type { XmlCommandDeps } from './xml-commands';

export function getIndentString(editor: vscode.TextEditor): string {
  const setting = vscode.workspace
    .getConfiguration('xmlVisualEditor', editor.document.uri)
    .get<string>('indentation', 'editor');
  switch (setting) {
    case '2':
      return '  ';
    case '4':
      return '    ';
    case 'tab':
      return '\t';
    default: {
      const tabSize = typeof editor.options.tabSize === 'number' ? editor.options.tabSize : 4;
      const insertSpaces = editor.options.insertSpaces !== false;
      return insertSpaces ? ' '.repeat(tabSize) : '\t';
    }
  }
}

export function registerFormattingCommands(
  context: vscode.ExtensionContext,
  deps: XmlCommandDeps,
): void {
  const { getEngine } = deps;

  context.subscriptions.push(
    vscode.commands.registerCommand('xmlVisualEditor.prettyPrint', async () => {
      const editor = vscode.window.activeTextEditor;
      const engine = getEngine();
      if (!editor || editor.document.languageId !== 'xml' || !engine?.isReady()) {
        void vscode.window.showWarningMessage('No active XML document or engine not ready.');
        return;
      }
      const docUri = editor.document.uri.toString();
      try {
        await engine.sendRequest('document.update', {
          doc_id: docUri,
          content: editor.document.getText(),
        });
        const indent = getIndentString(editor);
        const result = (await engine.sendRequest('document.prettyPrint', {
          doc_id: docUri,
          indent,
        })) as { content?: string };
        if (result?.content != null) {
          const totalLines = editor.document.lineCount;
          const cursorLine = editor.selection.active.line;
          const lineRatio = totalLines > 1 ? cursorLine / (totalLines - 1) : 0;
          const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            editor.document.lineAt(editor.document.lineCount - 1).range.end,
          );
          const wsEdit = new vscode.WorkspaceEdit();
          wsEdit.replace(editor.document.uri, fullRange, result.content);
          await vscode.workspace.applyEdit(wsEdit);
          const newTotalLines = editor.document.lineCount;
          const newLine = Math.min(Math.round(lineRatio * (newTotalLines - 1)), newTotalLines - 1);
          const pos = new vscode.Position(newLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
          void vscode.window.setStatusBarMessage('$(check) Pretty-printed', 3000);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Pretty-print failed: ${message}`);
      }
    }),

    vscode.commands.registerCommand('xmlVisualEditor.linearize', async () => {
      const editor = vscode.window.activeTextEditor;
      const engine = getEngine();
      if (!editor || editor.document.languageId !== 'xml' || !engine?.isReady()) {
        void vscode.window.showWarningMessage('No active XML document or engine not ready.');
        return;
      }
      const docUri = editor.document.uri.toString();
      try {
        await engine.sendRequest('document.update', {
          doc_id: docUri,
          content: editor.document.getText(),
        });
        const result = (await engine.sendRequest('document.linearize', {
          doc_id: docUri,
        })) as { content?: string };
        if (result?.content != null) {
          const fullRange = new vscode.Range(
            new vscode.Position(0, 0),
            editor.document.lineAt(editor.document.lineCount - 1).range.end,
          );
          const wsEdit = new vscode.WorkspaceEdit();
          wsEdit.replace(editor.document.uri, fullRange, result.content);
          await vscode.workspace.applyEdit(wsEdit);
          const pos = new vscode.Position(0, 0);
          editor.selection = new vscode.Selection(pos, pos);
          void vscode.window.setStatusBarMessage('$(check) Linearized', 3000);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`Linearize failed: ${message}`);
      }
    }),

    vscode.commands.registerCommand('xmlVisualEditor.stripWhitespace', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        void vscode.window.showWarningMessage('No active XML document.');
        return;
      }
      const text = editor.document.getText();
      // Process line-by-line: remove trailing whitespace, preserve leading indentation
      const lines = text.split('\n');
      const stripped = lines.map((line) => line.replace(/\s+$/, ''));
      const result = stripped.join('\n');
      if (result !== text) {
        const fullRange = new vscode.Range(
          new vscode.Position(0, 0),
          editor.document.lineAt(editor.document.lineCount - 1).range.end,
        );
        const wsEdit = new vscode.WorkspaceEdit();
        wsEdit.replace(editor.document.uri, fullRange, result);
        await vscode.workspace.applyEdit(wsEdit);
        void vscode.window.setStatusBarMessage('$(check) Whitespace stripped', 3000);
      } else {
        void vscode.window.setStatusBarMessage('$(check) No unnecessary whitespace found', 3000);
      }
    }),

    vscode.commands.registerCommand('xmlVisualEditor.expandSelfClosingTag', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        return;
      }

      const text = editor.document.getText();
      const offset = editor.document.offsetAt(editor.selection.active);

      // Find the self-closing tag around the cursor.
      // Scan backward from offset for '<' (not '</' which starts a closing tag).
      let tagStart = -1;
      for (let i = offset; i >= 0; i--) {
        if (text[i] === '<' && (i + 1 >= text.length || text[i + 1] !== '/')) {
          tagStart = i;
          break;
        }
        // Stop if we hit '>' before finding '<' (cursor is outside a tag)
        if (text[i] === '>' && i < offset) {
          break;
        }
      }

      // Cursor might be right after a self-closing tag's '>'
      if (tagStart === -1 && offset >= 2 && text[offset - 1] === '>' && text[offset - 2] === '/') {
        for (let i = offset - 3; i >= 0; i--) {
          if (text[i] === '<') {
            tagStart = i;
            break;
          }
        }
      }

      if (tagStart === -1) {
        void vscode.window.setStatusBarMessage('No self-closing tag at cursor', 3000);
        return;
      }

      // Find the '/>' that closes this tag
      const selfCloseIdx = text.indexOf('/>', tagStart);
      if (selfCloseIdx === -1 || selfCloseIdx > offset + 200) {
        void vscode.window.setStatusBarMessage('No self-closing tag at cursor', 3000);
        return;
      }

      const tagEnd = selfCloseIdx + 2;
      const tagText = text.substring(tagStart, tagEnd);

      if (!tagText.startsWith('<') || !tagText.endsWith('/>')) {
        void vscode.window.setStatusBarMessage('No self-closing tag at cursor', 3000);
        return;
      }

      // Extract tag name (supports namespaced tags like xs:element)
      const nameMatch = tagText.match(/^<([a-zA-Z_][\w.\-:]*)/);
      if (!nameMatch) {
        void vscode.window.setStatusBarMessage('No self-closing tag at cursor', 3000);
        return;
      }

      const tagName = nameMatch[1];
      const beforeSelfClose = tagText.substring(0, tagText.length - 2).trimEnd();
      const expanded = `${beforeSelfClose}></${tagName}>`;
      const cursorOffsetInExpanded = beforeSelfClose.length + 1; // after '>'

      const startPos = editor.document.positionAt(tagStart);
      const endPos = editor.document.positionAt(tagEnd);

      await editor.edit((editBuilder) => {
        editBuilder.replace(new vscode.Range(startPos, endPos), expanded);
      });

      // Position cursor between the opening and closing tags
      const newCursorPos = editor.document.positionAt(tagStart + cursorOffsetInExpanded);
      editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
    }),
  );
}
