import * as vscode from 'vscode';
import {
  CursorContextType,
  CursorElementInfo,
  getElementAtCursor,
} from '../utils/xml-cursor-parser';
import { SchemaService } from '../services/schema-service';

const DEBOUNCE_MS = 150;

/** Enriched cursor context combining element info, schema, and document metadata. */
export interface CursorContext {
  /** Local name of the element at cursor. */
  elementName: string | null;
  /** Path from root to current element. */
  elementPath: string[];
  /** Cursor context classification A–I. */
  cursorContext: CursorContextType;
  /** Attribute name if in attribute context (C, D). */
  currentAttribute: string | null;
  /** Schema ID if a schema is loaded for this document. */
  schemaId: string | undefined;
  /** The document URI. */
  documentUri: string;
  /** Full document text (for panels that need to read attribute values). */
  documentText: string;
  /** Zero-based cursor offset. */
  cursorOffset: number;
  /** Name of the last closed child element before cursor (for context F). */
  precedingSiblingName: string | null;
}

export class CursorTrackingService implements vscode.Disposable {
  private readonly _onCursorContextChanged = new vscode.EventEmitter<CursorContext>();
  readonly onCursorContextChanged: vscode.Event<CursorContext> = this._onCursorContextChanged.event;

  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastContext: CursorContext | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly schemaService: SchemaService) {
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        this.handleSelectionChange(e.textEditor);
      }),
    );

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.handleActiveEditorChange(editor);
      }),
    );

    // Compute initial context for the current editor.
    if (vscode.window.activeTextEditor) {
      this.computeAndFire(vscode.window.activeTextEditor);
    }
  }

  dispose(): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this._onCursorContextChanged.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  private handleSelectionChange(editor: vscode.TextEditor): void {
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      this.computeAndFire(editor);
    }, DEBOUNCE_MS);
  }

  private handleActiveEditorChange(editor: vscode.TextEditor | undefined): void {
    // Cancel any pending debounce from previous editor.
    if (this.debounceTimer !== undefined) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (!editor) {
      return;
    }

    // Immediate — no debounce on editor switch.
    this.computeAndFire(editor);
  }

  private computeAndFire(editor: vscode.TextEditor): void {
    const { document } = editor;

    if (document.languageId !== 'xml') {
      const ctx: CursorContext = {
        elementName: null,
        elementPath: [],
        cursorContext: 'I',
        currentAttribute: null,
        schemaId: undefined,
        documentUri: document.uri.toString(),
        documentText: document.getText(),
        cursorOffset: document.offsetAt(editor.selection.active),
        precedingSiblingName: null,
      };
      this.fireIfChanged(ctx);
      return;
    }

    const text = document.getText();
    const offset = document.offsetAt(editor.selection.active);
    const info: CursorElementInfo = getElementAtCursor(text, offset);

    const ctx: CursorContext = {
      elementName: info.elementName,
      elementPath: info.elementPath,
      cursorContext: info.cursorContext,
      currentAttribute: info.currentAttribute,
      schemaId: this.schemaService.getSchemaIdForDocument(document.uri.toString()),
      documentUri: document.uri.toString(),
      documentText: text,
      cursorOffset: offset,
      precedingSiblingName: info.precedingSiblingName,
    };

    this.fireIfChanged(ctx);
  }

  /** Force re-computation and emit, bypassing de-duplication.
   *  Useful when the schema association changes without cursor movement. */
  forceRefresh(): void {
    this.lastContext = undefined;
    if (vscode.window.activeTextEditor) {
      this.computeAndFire(vscode.window.activeTextEditor);
    }
  }

  private fireIfChanged(ctx: CursorContext): void {
    if (
      this.lastContext &&
      this.lastContext.documentUri === ctx.documentUri &&
      this.lastContext.elementName === ctx.elementName &&
      this.lastContext.cursorContext === ctx.cursorContext &&
      this.lastContext.currentAttribute === ctx.currentAttribute &&
      this.lastContext.schemaId === ctx.schemaId &&
      this.lastContext.precedingSiblingName === ctx.precedingSiblingName &&
      this.lastContext.elementPath.length === ctx.elementPath.length &&
      this.lastContext.elementPath.every((v, i) => v === ctx.elementPath[i])
    ) {
      return;
    }
    this.lastContext = ctx;
    this._onCursorContextChanged.fire(ctx);
  }
}
