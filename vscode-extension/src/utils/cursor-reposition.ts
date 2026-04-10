import * as vscode from 'vscode';

/**
 * After a full document replacement, repositions the cursor at the opening tag
 * of the specified element near the given line number.
 */
export function repositionCursorToElement(
  editor: vscode.TextEditor,
  elementName: string,
  nearLine: number,
): void {
  const searchStart = Math.max(0, nearLine - 2);
  const searchEnd = Math.min(editor.document.lineCount - 1, nearLine + 10);
  for (let lineIdx = searchStart; lineIdx <= searchEnd; lineIdx++) {
    const lineText = editor.document.lineAt(lineIdx).text;
    const tagStart = lineText.indexOf(`<${elementName}`);
    if (tagStart >= 0) {
      // Skip matches inside XML comments
      const commentStart = lineText.lastIndexOf('<!--', tagStart);
      if (commentStart >= 0) {
        const commentEnd = lineText.indexOf('-->', commentStart);
        if (commentEnd < 0 || commentEnd > tagStart) {
          continue;
        }
      }
      const nextChar = lineText[tagStart + elementName.length + 1];
      if (nextChar === ' ' || nextChar === '>' || nextChar === '/' || nextChar === undefined) {
        const tagClose = lineText.indexOf('>', tagStart);
        if (tagClose >= 0) {
          const pos = new vscode.Position(lineIdx, tagClose + 1);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          );
          return;
        }
      }
    }
  }
}
