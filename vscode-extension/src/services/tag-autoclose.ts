import * as vscode from 'vscode';

/**
 * Pure function: given the full document text, the offset of the '>' character,
 * and the text after the cursor on the same line, returns the tag name to auto-close
 * or null if auto-close should not trigger.
 */
export function extractTagNameForAutoClose(
  text: string,
  gtOffset: number,
  lineTextAfterCursor: string,
): string | null {
  if (gtOffset < 1 || gtOffset >= text.length || text[gtOffset] !== '>') {
    return null;
  }

  // Check for self-closing '/>'
  if (text[gtOffset - 1] === '/') {
    return null;
  }

  // Check for comment '-->'
  if (gtOffset >= 2 && text[gtOffset - 1] === '-' && text[gtOffset - 2] === '-') {
    return null;
  }

  // Check for CDATA ']]>'
  if (gtOffset >= 2 && text[gtOffset - 1] === ']' && text[gtOffset - 2] === ']') {
    return null;
  }

  // Check for processing instruction '?>'
  if (text[gtOffset - 1] === '?') {
    return null;
  }

  // Scan backward to find the matching '<'
  let i = gtOffset - 1;
  let inQuote: string | null = null;

  while (i >= 0) {
    const ch = text[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      }
      i--;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i--;
      continue;
    }
    if (ch === '<') {
      break;
    }
    // If we find another '>' it means something is wrong
    if (ch === '>') {
      return null;
    }
    i--;
  }

  if (i < 0 || text[i] !== '<') {
    return null;
  }

  // Check it's not a closing tag '</'
  if (i + 1 < text.length && text[i + 1] === '/') {
    return null;
  }

  // Check it's not '<!' (comment/CDATA/DOCTYPE)
  if (i + 1 < text.length && text[i + 1] === '!') {
    return null;
  }

  // Check it's not '<?' (processing instruction)
  if (i + 1 < text.length && text[i + 1] === '?') {
    return null;
  }

  // Extract tag name (from '<' to first whitespace, '>', or '/')
  const nameStart = i + 1;
  let nameEnd = nameStart;
  while (nameEnd < gtOffset) {
    const ch = text[nameEnd];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '/' || ch === '>') {
      break;
    }
    nameEnd++;
  }

  const tagName = text.substring(nameStart, nameEnd);
  if (!tagName || !/^[a-zA-Z_][\w.\-:]*$/.test(tagName)) {
    return null;
  }

  // Check if close tag already exists on the same line after the cursor
  if (lineTextAfterCursor.includes(`</${tagName}>`)) {
    return null;
  }

  return tagName;
}

export class TagAutoCloseService implements vscode.Disposable {
  private disposable: vscode.Disposable | undefined;
  private enabled = false;
  private processing = false;
  private suppressed = false;
  private outputChannel: vscode.OutputChannel;

  constructor() {
    this.outputChannel = vscode.window.createOutputChannel('XML AutoClose Debug');
  }

  enable(): void {
    if (this.enabled) {
      return;
    }
    this.enabled = true;
    this.disposable = vscode.workspace.onDidChangeTextDocument((event) => {
      this.handleChange(event);
    });
  }

  disable(): void {
    this.enabled = false;
    this.disposable?.dispose();
    this.disposable = undefined;
  }

  suppress(): void {
    this.suppressed = true;
  }

  unsuppress(): void {
    this.suppressed = false;
  }

  dispose(): void {
    this.disable();
    this.outputChannel.dispose();
  }

  private handleChange(event: vscode.TextDocumentChangeEvent): void {
    if (this.processing) {
      this.log('handleChange: skipped (processing)');
      return;
    }
    if (this.suppressed) {
      this.log('handleChange: skipped (suppressed)');
      return;
    }
    if (event.document.languageId !== 'xml') {
      return;
    }
    if (event.contentChanges.length === 0) {
      return;
    }
    this.log(
      `handleChange: ${event.contentChanges.length} changes, first text="${event.contentChanges[0]?.text}"`,
    );

    // First pass: look for '>' in typed/pasted text (normal auto-close)
    for (const change of event.contentChanges) {
      const gtIdx = change.text.lastIndexOf('>');
      if (gtIdx === -1) {
        continue;
      }
      const text = event.document.getText();
      const gtOffset = change.rangeOffset + gtIdx;

      // Sanity check
      if (gtOffset >= text.length || text[gtOffset] !== '>') {
        this.log(`handleChange: sanity check failed at offset ${gtOffset}`);
        continue;
      }

      const posAfterGt = event.document.positionAt(gtOffset + 1);
      const lineText = event.document.lineAt(posAfterGt.line).text;
      const afterCursor = lineText.substring(posAfterGt.character);

      const tagName = extractTagNameForAutoClose(text, gtOffset, afterCursor);
      this.log(`handleChange: gtOffset=${gtOffset}, tagName=${tagName ?? 'null'}`);

      if (tagName) {
        void this.insertCloseTag(event.document, posAfterGt, tagName);
        return;
      }
    }
  }

  private async insertCloseTag(
    document: vscode.TextDocument,
    pos: vscode.Position,
    tagName: string,
  ): Promise<void> {
    if (this.processing) {
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document !== document) {
      this.log('insertCloseTag: no matching editor');
      return;
    }

    this.processing = true;
    const closeTag = `</${tagName}>`;
    this.log(`insertCloseTag: inserting '${closeTag}' at ${pos.line}:${pos.character}`);

    try {
      const success = await editor.edit(
        (editBuilder) => {
          editBuilder.insert(pos, closeTag);
        },
        { undoStopBefore: false, undoStopAfter: true },
      );
      this.log(`insertCloseTag: edit success=${success}`);
      if (success) {
        editor.selection = new vscode.Selection(pos, pos);
      }
    } catch (err) {
      this.log(`insertCloseTag: ERROR ${String(err)}`);
    } finally {
      this.processing = false;
    }
  }

  private log(msg: string): void {
    this.outputChannel.appendLine(`[${new Date().toISOString()}] ${msg}`);
  }
}
