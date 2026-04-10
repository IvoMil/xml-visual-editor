import * as vscode from 'vscode';
import * as path from 'path';
import { EngineClient } from '../engine/engine-client';
import { ValidationService } from '../services/validation-service';
import { SchemaService } from '../services/schema-service';
import { CursorTrackingService } from '../services/cursor-tracking-service';
import { EditorOperations } from '../services/editor-operations';
import { XmlActionsProvider } from '../panels/xml-actions-provider';
import { ElementsPanelProvider } from '../panels/elements-panel';
import { AttributesPanelProvider } from '../panels/attributes-panel';
import { TagAutoCloseService } from '../services/tag-autoclose';
import { getElementAtCursor, findEnclosingElementRange } from '../utils/xml-cursor-parser';
import { registerFormattingCommands, getIndentString } from './formatting-commands';

export interface XmlCommandDeps {
  getEngine: () => EngineClient | undefined;
  getValidation: () => ValidationService | undefined;
  getSchema: () => SchemaService | undefined;
  getXmlActions: () => XmlActionsProvider | undefined;
  getCursorTracking: () => CursorTrackingService | undefined;
  editorOps: EditorOperations;
  getElementsPanel: () => ElementsPanelProvider | undefined;
  getAttributesPanel: () => AttributesPanelProvider | undefined;
  getAutoClose: () => TagAutoCloseService | undefined;
}

export function registerXmlCommands(context: vscode.ExtensionContext, deps: XmlCommandDeps): void {
  const {
    getEngine,
    getValidation,
    getSchema,
    getXmlActions,
    getCursorTracking,
    editorOps,
    getElementsPanel,
    getAttributesPanel,
    getAutoClose,
  } = deps;

  // Local toggle state (encapsulated — only these commands need it)
  let filterActive = false;
  let docColumnVisible = true;
  let typeColumnVisible = true;
  let attrDocColumnVisible = true;
  let attrTypeColumnVisible = true;

  // Initialize VS Code context to match local state defaults
  void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.filterActive', false);
  void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.docColumnVisible', true);
  void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.typeColumnVisible', true);
  void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.attrDocColumnVisible', true);
  void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.attrTypeColumnVisible', true);

  // Document formatting provider (Shift+Alt+F)
  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: 'xml', scheme: 'file' },
      {
        async provideDocumentFormattingEdits(
          document: vscode.TextDocument,
        ): Promise<vscode.TextEdit[]> {
          const engine = getEngine();
          if (!engine?.isReady()) {
            return [];
          }
          const docUri = document.uri.toString();
          try {
            await engine.sendRequest('document.update', {
              doc_id: docUri,
              content: document.getText(),
            });
            const editor = vscode.window.activeTextEditor;
            const indent = editor ? getIndentString(editor) : '  ';
            const result = (await engine.sendRequest('document.prettyPrint', {
              doc_id: docUri,
              indent,
            })) as { content?: string };
            if (result?.content != null) {
              const fullRange = new vscode.Range(
                new vscode.Position(0, 0),
                document.lineAt(document.lineCount - 1).range.end,
              );
              return [vscode.TextEdit.replace(fullRange, result.content)];
            }
          } catch {
            // Silently fail for format-on-save scenarios
          }
          return [];
        },
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('xmlVisualEditor.validateDocument', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        void vscode.window.showWarningMessage('No active XML document to validate.');
        return;
      }
      await getValidation()?.validateFull(editor.document);
      const count = vscode.languages.getDiagnostics(editor.document.uri).length;
      getXmlActions()?.setValidationStatus(count);
    }),

    vscode.commands.registerCommand('xmlVisualEditor.checkWellFormedness', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        void vscode.window.showWarningMessage('No active XML document to check.');
        return;
      }
      const statusMsg = vscode.window.setStatusBarMessage(
        '$(loading~spin) Checking well-formedness...',
      );
      try {
        await getValidation()?.validateDocument(editor.document);
      } finally {
        statusMsg.dispose();
      }
      const count = vscode.languages.getDiagnostics(editor.document.uri).length;
      getXmlActions()?.setValidationStatus(count);
      if (count === 0) {
        void vscode.window.showInformationMessage('XML is well-formed — no errors found.');
      } else {
        void vscode.window.showWarningMessage(
          `XML is not well-formed — ${count} error${count !== 1 ? 's' : ''} found. Check the Problems panel.`,
        );
      }
    }),

    vscode.commands.registerCommand('xmlVisualEditor.validateSchema', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        void vscode.window.showWarningMessage('No active XML document to validate.');
        return;
      }
      const schemaId = getSchema()?.getSchemaIdForDocument(editor.document.uri.toString());
      if (!schemaId) {
        void vscode.window.showWarningMessage(
          'No schema loaded for this document. Use "Load XSD Schema" first.',
        );
        return;
      }
      await getValidation()?.validateWithSchema(editor.document, schemaId);
    }),

    vscode.commands.registerCommand('xmlVisualEditor.insertElement', async () => {
      const name = await vscode.window.showInputBox({ prompt: 'Element name to insert' });
      if (name) {
        await editorOps.handleInsertElement(name);
      }
    }),

    vscode.commands.registerCommand('xmlVisualEditor.toggleFilter', () => {
      filterActive = !filterActive;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.filterActive',
        filterActive,
      );
      getElementsPanel()?.sendMessage({ type: 'toggleFilter' });
    }),
    vscode.commands.registerCommand('xmlVisualEditor.toggleFilterActive', () => {
      filterActive = !filterActive;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.filterActive',
        filterActive,
      );
      getElementsPanel()?.sendMessage({ type: 'toggleFilter' });
    }),

    vscode.commands.registerCommand('xmlVisualEditor.toggleDocColumn', () => {
      docColumnVisible = !docColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.docColumnVisible',
        docColumnVisible,
      );
      getElementsPanel()?.sendMessage({ type: 'toggleDocColumn' });
    }),
    vscode.commands.registerCommand('xmlVisualEditor.toggleDocColumnHidden', () => {
      docColumnVisible = !docColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.docColumnVisible',
        docColumnVisible,
      );
      getElementsPanel()?.sendMessage({ type: 'toggleDocColumn' });
    }),

    vscode.commands.registerCommand('xmlVisualEditor.toggleTypeColumn', () => {
      typeColumnVisible = !typeColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.typeColumnVisible',
        typeColumnVisible,
      );
      getElementsPanel()?.sendMessage({ type: 'toggleTypeColumn' });
    }),
    vscode.commands.registerCommand('xmlVisualEditor.toggleTypeColumnHidden', () => {
      typeColumnVisible = !typeColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.typeColumnVisible',
        typeColumnVisible,
      );
      getElementsPanel()?.sendMessage({ type: 'toggleTypeColumn' });
    }),

    vscode.commands.registerCommand('xmlVisualEditor.toggleAttrDocColumn', () => {
      attrDocColumnVisible = !attrDocColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.attrDocColumnVisible',
        attrDocColumnVisible,
      );
      getAttributesPanel()?.sendMessage({ type: 'toggleDocColumn' });
    }),
    vscode.commands.registerCommand('xmlVisualEditor.toggleAttrDocColumnHidden', () => {
      attrDocColumnVisible = !attrDocColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.attrDocColumnVisible',
        attrDocColumnVisible,
      );
      getAttributesPanel()?.sendMessage({ type: 'toggleDocColumn' });
    }),
    vscode.commands.registerCommand('xmlVisualEditor.toggleAttrTypeColumn', () => {
      attrTypeColumnVisible = !attrTypeColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.attrTypeColumnVisible',
        attrTypeColumnVisible,
      );
      getAttributesPanel()?.sendMessage({ type: 'toggleTypeColumn' });
    }),
    vscode.commands.registerCommand('xmlVisualEditor.toggleAttrTypeColumnHidden', () => {
      attrTypeColumnVisible = !attrTypeColumnVisible;
      void vscode.commands.executeCommand(
        'setContext',
        'xmlvisualeditor.attrTypeColumnVisible',
        attrTypeColumnVisible,
      );
      getAttributesPanel()?.sendMessage({ type: 'toggleTypeColumn' });
    }),

    vscode.commands.registerCommand('xmlVisualEditor.expandAll', () => {
      getElementsPanel()?.sendMessage({ type: 'expandAll' });
    }),
    vscode.commands.registerCommand('xmlVisualEditor.collapseAll', () => {
      getElementsPanel()?.sendMessage({ type: 'collapseAll' });
    }),

    vscode.commands.registerCommand('xmlVisualEditor.loadSchema', async () => {
      const uris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        filters: { 'XSD Schema': ['xsd'] },
        openLabel: 'Load Schema',
      });
      if (!uris || uris.length === 0) {
        return;
      }
      try {
        const schemaId = await getSchema()?.loadSchemaFromFile(uris[0].fsPath);
        void vscode.window.showInformationMessage(`Schema loaded: ${uris[0].fsPath}`);
        getXmlActions()?.setSchema(path.basename(uris[0].fsPath), uris[0].fsPath);

        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'xml' && schemaId) {
          getSchema()?.associateSchemaWithDocument(editor.document.uri.toString(), schemaId);
          await getValidation()?.validateWithSchema(editor.document, schemaId);
          getCursorTracking()?.forceRefresh();
        }
      } catch {
        // Error already shown by SchemaService
      }
    }),

    vscode.commands.registerCommand('xmlVisualEditor.toggleAutoClose', () => {
      void vscode.workspace
        .getConfiguration('xmlVisualEditor')
        .update('autoCloseTag', true, vscode.ConfigurationTarget.Global);
      void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.autoCloseActive', true);
      getAutoClose()?.enable();
      getXmlActions()?.setAutoCloseActive(true);
    }),

    vscode.commands.registerCommand('xmlVisualEditor.toggleAutoCloseActive', () => {
      void vscode.workspace
        .getConfiguration('xmlVisualEditor')
        .update('autoCloseTag', false, vscode.ConfigurationTarget.Global);
      void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.autoCloseActive', false);
      getAutoClose()?.disable();
      getXmlActions()?.setAutoCloseActive(false);
    }),

    vscode.commands.registerCommand('xmlVisualEditor.copyXmlPath', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        void vscode.window.showWarningMessage('No active XML document.');
        return;
      }
      const offset = editor.document.offsetAt(editor.selection.active);
      const info = getElementAtCursor(editor.document.getText(), offset);
      if (!info.simpleXPath) {
        void vscode.window.showWarningMessage('Cursor is not inside an XML element.');
        return;
      }
      await vscode.env.clipboard.writeText(info.simpleXPath);
      void vscode.window.setStatusBarMessage(`$(clippy) Copied: ${info.simpleXPath}`, 3000);
    }),

    vscode.commands.registerCommand('xmlVisualEditor.copyXmlPathWithPredicates', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        void vscode.window.showWarningMessage('No active XML document.');
        return;
      }
      const offset = editor.document.offsetAt(editor.selection.active);
      const info = getElementAtCursor(editor.document.getText(), offset);
      if (!info.xpathWithPredicates) {
        void vscode.window.showWarningMessage('Cursor is not inside an XML element.');
        return;
      }
      await vscode.env.clipboard.writeText(info.xpathWithPredicates);
      void vscode.window.setStatusBarMessage(`$(clippy) Copied: ${info.xpathWithPredicates}`, 3000);
    }),

    vscode.commands.registerCommand('xmlVisualEditor.selectCurrentElement', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        return;
      }
      const text = editor.document.getText();
      const offset = editor.document.offsetAt(editor.selection.active);
      const range = findEnclosingElementRange(text, offset);
      if (!range) {
        return;
      }
      const startPos = editor.document.positionAt(range.openStart);
      const endPos = editor.document.positionAt(range.closeEnd);
      editor.selection = new vscode.Selection(startPos, endPos);
      editor.revealRange(new vscode.Range(startPos, endPos));
    }),

    vscode.commands.registerCommand('xmlVisualEditor.goToMatchingTag', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'xml') {
        return;
      }
      const text = editor.document.getText();
      const offset = editor.document.offsetAt(editor.selection.active);
      const cursorInfo = getElementAtCursor(text, offset);
      const range = findEnclosingElementRange(text, offset);
      if (!range || !cursorInfo.elementName) {
        return;
      }
      const openTagEnd = text.indexOf('>', range.openStart);
      if (openTagEnd === -1) {
        return;
      }

      let targetOffset: number;
      if (cursorInfo.cursorContext === 'G') {
        // In closing tag → jump to opening tag
        targetOffset = range.openStart + 1;
      } else if (cursorInfo.cursorContext === 'A' || cursorInfo.cursorContext === 'B') {
        // In opening tag → jump to closing tag
        const closeTagStart = text.lastIndexOf('</', range.closeEnd);
        targetOffset = closeTagStart !== -1 ? closeTagStart + 2 : range.openStart + 1;
      } else {
        // In content → jump to opening tag
        targetOffset = range.openStart + 1;
      }

      const pos = editor.document.positionAt(targetOffset);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }),
  );

  registerFormattingCommands(context, deps);
}
