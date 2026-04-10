import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { repositionCursorToElement } from '../../utils/cursor-reposition';

function createMockEditor(lines: string[]): vscode.TextEditor {
  return {
    document: {
      lineCount: lines.length,
      lineAt: (lineIdx: number) => ({ text: lines[lineIdx] }),
    },
    selection: new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0)),
    revealRange: () => {},
  } as unknown as vscode.TextEditor;
}

describe('repositionCursorToElement', () => {
  const xmlLines = [
    '<?xml version="1.0"?>', // 0
    '<root>', // 1
    '  <header>Title</header>', // 2
    '  <body>', // 3
    '    <paragraph>Text</paragraph>', // 4
    '    <metadata>Info</metadata>', // 5
    '    <metadataExtra>X</metadataExtra>', // 6
    '  </body>', // 7
    '</root>', // 8
  ];

  it('finds element on exact line', () => {
    const editor = createMockEditor(xmlLines);
    repositionCursorToElement(editor, 'metadata', 5);
    assert.strictEqual(editor.selection.active.line, 5);
    // <metadata> — '>' is at index 13, cursor goes to 14
    assert.strictEqual(editor.selection.active.character, 14);
  });

  it('finds element within +2 offset (nearLine before element)', () => {
    const editor = createMockEditor(xmlLines);
    repositionCursorToElement(editor, 'metadata', 3);
    assert.strictEqual(editor.selection.active.line, 5);
    assert.strictEqual(editor.selection.active.character, 14);
  });

  it('finds element within -2 offset (nearLine after element)', () => {
    const editor = createMockEditor(xmlLines);
    repositionCursorToElement(editor, 'metadata', 7);
    // searchStart = max(0, 7-2) = 5, so line 5 is included
    assert.strictEqual(editor.selection.active.line, 5);
    assert.strictEqual(editor.selection.active.character, 14);
  });

  it('positions cursor after /> for self-closing element', () => {
    const lines = ['<root>', '  <item/>', '</root>'];
    const editor = createMockEditor(lines);
    repositionCursorToElement(editor, 'item', 1);
    assert.strictEqual(editor.selection.active.line, 1);
    // '  <item/>' — '>' is at index 8, cursor at 9
    assert.strictEqual(editor.selection.active.character, 9);
  });

  it('positions cursor after > for element with attributes', () => {
    const lines = ['<root>', '  <metadata id="1" type="info">Content</metadata>', '</root>'];
    const editor = createMockEditor(lines);
    repositionCursorToElement(editor, 'metadata', 1);
    assert.strictEqual(editor.selection.active.line, 1);
    // '  <metadata id="1" type="info">' — '>' at index 30, cursor at 31
    assert.strictEqual(editor.selection.active.character, 31);
  });

  it('does not move cursor when element not in range', () => {
    const editor = createMockEditor(xmlLines);
    repositionCursorToElement(editor, 'nonexistent', 5);
    // Selection should remain at initial (0, 0)
    assert.strictEqual(editor.selection.active.line, 0);
    assert.strictEqual(editor.selection.active.character, 0);
  });

  it('does not match partial element names', () => {
    const editor = createMockEditor(xmlLines);
    // Line 6 has <metadataExtra>, searching for 'metadata' near line 6
    // Line 5 has <metadata> which is within range, but line 6's <metadataExtra> should NOT be matched first
    // searchStart = max(0, 6-2) = 4, so it scans lines 4..8
    // Line 5 has <metadata> (valid match), line 6 has <metadataExtra> (should not match)
    repositionCursorToElement(editor, 'metadata', 6);
    // Should find <metadata> on line 5, NOT <metadataExtra> on line 6
    assert.strictEqual(editor.selection.active.line, 5);
    assert.strictEqual(editor.selection.active.character, 14);
  });

  it('calls revealRange with InCenterIfOutsideViewport', () => {
    let revealedRange: vscode.Range | undefined;
    let revealType: vscode.TextEditorRevealType | undefined;
    const editor = createMockEditor(xmlLines);
    (editor as any).revealRange = (range: vscode.Range, type: vscode.TextEditorRevealType) => {
      revealedRange = range;
      revealType = type;
    };
    repositionCursorToElement(editor, 'metadata', 5);
    assert.ok(revealedRange, 'revealRange should have been called');
    assert.strictEqual(revealType, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  });
});
