import * as vscode from 'vscode';
import { EngineClient } from './engine/engine-client';
import { ValidationService } from './services/validation-service';
import { SchemaService } from './services/schema-service';
import { CursorContext, CursorTrackingService } from './services/cursor-tracking-service';
import { EditorOperations } from './services/editor-operations';
import { ElementsPanelProvider } from './panels/elements-panel';
import { AttributesPanelProvider } from './panels/attributes-panel';
import { InfoPanelProvider } from './panels/info-panel';
import { XmlActionsProvider } from './panels/xml-actions-provider';
import { XmlCompletionProvider } from './providers/xml-completion-provider';
import { GutterDecorationService } from './services/gutter-decoration-service';
import { XmlFixProvider } from './providers/xml-fix-provider';
import { resolveThemeColors, invalidateThemeColorCache } from './shared/panel-utils';
import { TagAutoCloseService } from './services/tag-autoclose';
import { registerElementInsertionCommands } from './commands/element-insertion-commands';
import { registerXmlCommands } from './commands/xml-commands';

let engineClient: EngineClient | undefined;
let gutterService: GutterDecorationService | undefined;
let validationService: ValidationService | undefined;
let schemaService: SchemaService | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let cursorTrackingService: CursorTrackingService | undefined;
let elementsPanelProvider: ElementsPanelProvider | undefined;
let attributesPanelProvider: AttributesPanelProvider | undefined;
let infoPanelProvider: InfoPanelProvider | undefined;
let xmlActionsProvider: XmlActionsProvider | undefined;
let lastCursorContext: CursorContext | undefined;
let insertRequiredMode = true;
let suppressAutoReveal = false;
let autoCloseService: TagAutoCloseService | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  await resolveThemeColors();
  engineClient = new EngineClient(context);
  gutterService = new GutterDecorationService(context.extensionPath);
  validationService = new ValidationService(engineClient, (docUri) =>
    schemaService?.getSchemaIdForDocument(docUri),
  );
  schemaService = new SchemaService(engineClient, context.globalStorageUri);
  cursorTrackingService = new CursorTrackingService(schemaService);
  const editorOps = new EditorOperations(
    () => engineClient,
    () => cursorTrackingService,
    () => lastCursorContext,
    () => insertRequiredMode,
    () => autoCloseService,
  );
  elementsPanelProvider = new ElementsPanelProvider(engineClient);
  attributesPanelProvider = new AttributesPanelProvider(
    engineClient,
    editorOps.applyAttributeEdit.bind(editorOps),
  );
  infoPanelProvider = new InfoPanelProvider(engineClient);
  xmlActionsProvider = new XmlActionsProvider();
  autoCloseService = new TagAutoCloseService();
  // Register CodeAction provider
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'xml', scheme: 'file' },
      new XmlFixProvider(),
      XmlFixProvider.metadata,
    ),
  );

  // Register webview providers
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('xmlvisualeditor.actionsPanel', xmlActionsProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerWebviewViewProvider(
      'xmlvisualeditor.elementsPanel',
      elementsPanelProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider(
      'xmlvisualeditor.attributesPanel',
      attributesPanelProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
    vscode.window.registerWebviewViewProvider('xmlvisualeditor.infoPanel', infoPanelProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Configuration change handler
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (
        e.affectsConfiguration('xmlVisualEditor.panels.fontSize') ||
        e.affectsConfiguration('xmlVisualEditor.panels.fontFamily')
      ) {
        if (lastCursorContext) {
          void elementsPanelProvider?.update(lastCursorContext);
          void attributesPanelProvider?.update(lastCursorContext);
          void infoPanelProvider?.update(lastCursorContext);
        }
      }
      if (e.affectsConfiguration('xmlVisualEditor.validation')) {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === 'xml') {
          void validationService?.validateFull(editor.document);
        }
      }
      if (e.affectsConfiguration('xmlVisualEditor.validation.showGutterWarnings')) {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.languageId === 'xml') {
          gutterService?.updateDecorations(editor);
        }
      }
      if (e.affectsConfiguration('xmlVisualEditor.autoCloseTag')) {
        const enabled = vscode.workspace
          .getConfiguration('xmlVisualEditor', vscode.window.activeTextEditor?.document.uri)
          .get<boolean>('autoCloseTag', true);
        void vscode.commands.executeCommand(
          'setContext',
          'xmlvisualeditor.autoCloseActive',
          enabled,
        );
        xmlActionsProvider?.setAutoCloseActive(enabled);
        if (enabled) {
          autoCloseService?.enable();
        } else {
          autoCloseService?.disable();
        }
      }
    }),
  );

  // Panel synchronization
  cursorTrackingService.onCursorContextChanged((ctx) => {
    lastCursorContext = ctx;
    if (ctx.documentText && ctx.documentUri && engineClient?.isReady()) {
      void engineClient
        .sendRequest('document.update', {
          doc_id: ctx.documentUri,
          content: ctx.documentText,
        })
        .catch(() => {
          /* ignore sync errors */
        });
    }
    void elementsPanelProvider?.update(ctx);
    void attributesPanelProvider?.update(ctx);
    void infoPanelProvider?.update(ctx);
  });

  elementsPanelProvider.onElementSelected((selection) => {
    void infoPanelProvider?.showElementInfo(selection.name, selection.schemaId);
    if (lastCursorContext?.elementPath) {
      void attributesPanelProvider?.showElementAttributes(selection.name, selection.schemaId, [
        ...lastCursorContext.elementPath,
        selection.name,
      ]);
    }
  });
  elementsPanelProvider.onInsertElement((data) => {
    void editorOps.handleInsertElement(data.name, data.compositorInsert);
  });
  elementsPanelProvider.onFocusedChildChanged((focusedChild) => {
    if (focusedChild) {
      void infoPanelProvider?.showElementInfo(focusedChild.name, focusedChild.schemaId);
      void attributesPanelProvider?.showElementAttributes(
        focusedChild.name,
        focusedChild.schemaId,
        [...focusedChild.parentPath, focusedChild.name],
      );
    }
  });
  elementsPanelProvider.onRequestRefresh(() => {
    cursorTrackingService?.forceRefresh();
  });

  // Register completion provider
  const completionProvider = new XmlCompletionProvider(
    engineClient,
    schemaService,
    (uri) => uri, // doc_id is the URI string in our project
    () => insertRequiredMode,
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: 'xml', scheme: 'file' },
      completionProvider,
      '<',
      ' ',
      '"',
      "'",
    ),
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(loading~spin) XVE: Starting...';
  statusBarItem.show();
  void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.insertRequiredActive', true);

  const autoCloseDefault = vscode.workspace
    .getConfiguration('xmlVisualEditor', null)
    .get<boolean>('autoCloseTag', true);
  void vscode.commands.executeCommand(
    'setContext',
    'xmlvisualeditor.autoCloseActive',
    autoCloseDefault,
  );
  xmlActionsProvider?.setAutoCloseActive(autoCloseDefault);
  if (autoCloseDefault && autoCloseService) {
    autoCloseService.enable();
  }

  engineClient.onReady(() => {
    updateStatusBar('ready');

    // Initialize XML Actions panel with active file BEFORE docs load
    // (handleDocumentOpen will set schema/validation state afterward)
    if (vscode.window.activeTextEditor?.document.languageId === 'xml') {
      xmlActionsProvider?.setActiveFile(vscode.window.activeTextEditor.document.uri.fsPath);
    }

    // Open all XML documents and wait for schemas to load before revealing panels
    const opens = vscode.workspace.textDocuments
      .filter((doc) => doc.languageId === 'xml')
      .map((doc) => handleDocumentOpen(doc).catch(() => {}));

    void Promise.allSettled(opens).then(async () => {
      const isXml = vscode.window.activeTextEditor?.document.languageId === 'xml';
      if (isXml) {
        await vscode.commands.executeCommand('setContext', 'xmlvisualeditor.isXmlFileOpen', true);
        // Brief delay to let VS Code process when-clause context changes
        await new Promise((resolve) => setTimeout(resolve, 300));
        const cfg = vscode.workspace.getConfiguration('xmlVisualEditor');
        if (cfg.get<boolean>('panels.autoReveal', true)) {
          const showElements = cfg.get<boolean>('panels.showElements', true);
          const showAttributes = cfg.get<boolean>('panels.showAttributes', true);
          const showInfo = cfg.get<boolean>('panels.showInfo', true);

          if (showElements) {
            await vscode.commands.executeCommand('xmlvisualeditor.elementsPanel.focus');
          } else if (showAttributes) {
            await vscode.commands.executeCommand('xmlvisualeditor.attributesPanel.focus');
          } else if (showInfo) {
            await vscode.commands.executeCommand('xmlvisualeditor.infoPanel.focus');
          }
        }
        await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
      }
      // Always refresh cursor tracking after docs/schemas are loaded,
      // regardless of whether active editor is XML (panels need context)
      cursorTrackingService?.forceRefresh();
    });
  });

  engineClient.onError((err) => {
    updateStatusBar('error');
    console.error(`Engine error: ${err.message}`);
  });
  engineClient.onExit((code) => {
    if (code !== 0 && code !== null) {
      updateStatusBar('error');
    }
  });

  const toggleInsertRequired = (): void => {
    insertRequiredMode = !insertRequiredMode;
    void vscode.commands.executeCommand(
      'setContext',
      'xmlvisualeditor.insertRequiredActive',
      insertRequiredMode,
    );
    elementsPanelProvider?.setInsertMode(insertRequiredMode);
    xmlActionsProvider?.setInsertRequiredActive(insertRequiredMode);
    void vscode.commands.executeCommand('editor.action.triggerSuggest');
  };

  registerXmlCommands(context, {
    getEngine: () => engineClient,
    getValidation: () => validationService,
    getSchema: () => schemaService,
    getXmlActions: () => xmlActionsProvider,
    getCursorTracking: () => cursorTrackingService,
    editorOps,
    getElementsPanel: () => elementsPanelProvider,
    getAttributesPanel: () => attributesPanelProvider,
    getAutoClose: () => autoCloseService,
  });
  registerElementInsertionCommands(
    context,
    () => engineClient,
    () => cursorTrackingService,
    () => insertRequiredMode,
    () => autoCloseService,
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('xmlVisualEditor.toggleInsertRequired', toggleInsertRequired),
    vscode.commands.registerCommand(
      'xmlVisualEditor.toggleInsertRequiredActive',
      toggleInsertRequired,
    ),
    vscode.commands.registerCommand('xmlVisualEditor.openSettings', () => {
      suppressAutoReveal = true;
      void vscode.commands.executeCommand(
        'workbench.action.openSettings',
        '@ext:IvoSoft.xml-visual-editor',
      );
      setTimeout(() => {
        suppressAutoReveal = false;
      }, 1000);
    }),
  );

  // Document event handlers
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (doc.languageId !== 'xml') return;
      const cfg = vscode.workspace.getConfiguration('xmlVisualEditor', doc.uri);
      if (cfg.get<boolean>('validateOnOpen', true)) {
        void handleDocumentOpen(doc);
      }
    }),

    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.languageId !== 'xml') return;
      const cfg = vscode.workspace.getConfiguration('xmlVisualEditor', doc.uri);
      if (cfg.get<boolean>('validateOnSave', true)) {
        void validationService?.validateFull(doc);
      }
    }),

    vscode.workspace.onDidChangeTextDocument((event) => {
      validationService?.scheduleValidation(event.document);
      editorOps.scheduleDocumentSync(event.document);
    }),

    vscode.workspace.onDidCloseTextDocument((doc) => {
      validationService?.clearDiagnostics(doc.uri);
    }),
  );

  const updateXmlContext = (): void => {
    const hasXmlOpen = vscode.workspace.textDocuments.some(
      (doc) => doc.languageId === 'xml' && doc.uri.scheme === 'file',
    );
    void vscode.commands.executeCommand('setContext', 'xmlvisualeditor.isXmlFileOpen', hasXmlOpen);
  };

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateXmlContext();
      if (editor?.document.languageId === 'xml') {
        xmlActionsProvider?.setActiveFile(editor.document.uri.fsPath);
      } else {
        xmlActionsProvider?.setActiveFile('');
      }
      // Ensure schema is loaded and panels refresh when switching to XML
      if (editor?.document.languageId === 'xml') {
        gutterService?.updateDecorations(editor);
      }
      if (editor?.document.languageId === 'xml' && engineClient?.isReady()) {
        // Reveal panel container, then immediately return focus to editor
        const cfg = vscode.workspace.getConfiguration('xmlVisualEditor');
        if (cfg.get<boolean>('panels.autoReveal', true) && !suppressAutoReveal) {
          void vscode.commands
            .executeCommand('xmlvisualeditor.elementsPanel.focus')
            .then(() => vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup'));
        }
        void handleDocumentOpen(editor.document).then(() => {
          cursorTrackingService?.forceRefresh();
        });
      }
    }),
  );
  updateXmlContext();

  // Refresh panels when theme changes so CSS variables re-resolve
  context.subscriptions.push(
    vscode.window.onDidChangeActiveColorTheme(() => {
      // VS Code fires this event before updating workbench.colorTheme config.
      // Delay to ensure getConfiguration returns the new theme ID.
      setTimeout(() => {
        invalidateThemeColorCache();
        void resolveThemeColors().then(() => {
          elementsPanelProvider?.sendColors();
          attributesPanelProvider?.sendColors();
          infoPanelProvider?.sendColors();
          if (lastCursorContext) {
            void elementsPanelProvider?.update(lastCursorContext);
            void attributesPanelProvider?.update(lastCursorContext);
            void infoPanelProvider?.update(lastCursorContext);
          }
        });
      }, 500);
    }),
  );

  // Auto-trigger completions when cursor is placed right after '<'
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (
        event.kind !== vscode.TextEditorSelectionChangeKind.Mouse &&
        event.kind !== vscode.TextEditorSelectionChangeKind.Keyboard
      ) {
        return;
      }
      const editor = event.textEditor;
      if (editor.document.languageId !== 'xml') return;
      const pos = event.selections[0]?.active;
      if (!pos || pos.character === 0) return;
      const charBefore = editor.document.getText(
        new vscode.Range(pos.line, pos.character - 1, pos.line, pos.character),
      );
      if (charBefore === '<') {
        void vscode.commands.executeCommand('editor.action.triggerSuggest');
      }
    }),
  );

  // Refresh gutter decorations when diagnostics change
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      if (e.uris.some((uri) => uri.toString() === editor.document.uri.toString())) {
        gutterService?.updateDecorations(editor);
      }
    }),
  );

  context.subscriptions.push(
    engineClient,
    validationService,
    schemaService,
    statusBarItem,
    cursorTrackingService,
    elementsPanelProvider,
    gutterService,
    autoCloseService,
  );

  // Start the engine
  void engineClient.start().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to start engine: ${message}`);
    updateStatusBar('error');
    void vscode.window.showErrorMessage(`XML Visual Editor: Failed to start engine — ${message}`);
  });
}

export function deactivate(): void {
  void engineClient?.stop();
}

async function handleDocumentOpen(document: vscode.TextDocument): Promise<void> {
  if (document.languageId !== 'xml') {
    return;
  }

  // Try to auto-load schema
  const schemaLoadResult = (await schemaService?.loadSchemaForDocument(document)) ?? 'no-reference';

  // Update actions panel with schema info
  const schemaId = schemaService?.getSchemaIdForDocument(document.uri.toString());
  if (schemaId) {
    xmlActionsProvider?.setSchema(schemaId);
  } else {
    xmlActionsProvider?.setSchema('');
  }

  // Sync document content to engine so panels can read current attribute values
  if (engineClient?.isReady()) {
    await engineClient
      .sendRequest('document.update', {
        doc_id: document.uri.toString(),
        content: document.getText(),
      })
      .catch(() => {
        /* Engine may not support document.update yet */
      });
  }

  // Refresh panels in case schema was just loaded
  cursorTrackingService?.forceRefresh();

  // Validate
  await validationService?.validateFull(document);

  // Update actions panel with validation status
  const diagnosticCount = vscode.languages.getDiagnostics(document.uri).length;
  if (schemaLoadResult === 'load-failed' && diagnosticCount === 0) {
    // Schema reference found but couldn't be loaded — don't show misleading "Valid"
    xmlActionsProvider?.setValidationStatus(-2);
  } else {
    xmlActionsProvider?.setValidationStatus(diagnosticCount);
  }
}

function updateStatusBar(state: 'ready' | 'starting' | 'error'): void {
  if (!statusBarItem) {
    return;
  }

  switch (state) {
    case 'ready':
      statusBarItem.text = '$(check) XVE: Ready';
      statusBarItem.tooltip = 'XML Visual Editor engine is running';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'starting':
      statusBarItem.text = '$(loading~spin) XVE: Starting...';
      statusBarItem.tooltip = 'XML Visual Editor engine is starting';
      statusBarItem.backgroundColor = undefined;
      break;
    case 'error':
      statusBarItem.text = '$(error) XVE: Error';
      statusBarItem.tooltip = 'XML Visual Editor engine encountered an error';
      statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
      break;
  }
}
