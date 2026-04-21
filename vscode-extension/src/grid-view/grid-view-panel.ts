import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { GridTreeNodeData } from './grid-view-types';
import { GridModel } from './model/grid-model';
import { GridNode } from './model/grid-node';
import { collectRenderableIds } from './model/collect-renderable-ids';
import { computeFingerprints } from './model/compute-fingerprints';
import { createToggleState } from './model/toggle-state';
import { GridRenderer } from './view/grid-renderer';
import { GRID_THEME_CSS } from './styles/grid-theme';
import { GRID_STATIC_CSS } from './styles/grid-css';
import { GRID_VIEW_WEBVIEW_SCRIPT } from './scripts/grid-view-webview-script';

let gridViewOutputChannel: vscode.OutputChannel | undefined;
function getGridViewOutputChannel(): vscode.OutputChannel {
  if (!gridViewOutputChannel) {
    gridViewOutputChannel = vscode.window.createOutputChannel('XML Grid View');
  }
  return gridViewOutputChannel;
}

interface SelectionSnapshot {
  nodeIds: string[];
  anchor: string | null;
  activeCursor: string | null;
  // Column-axis fields (optional — legacy row-only snapshots omit them).
  columnIds?: string[];
  columnAnchor?: string | null;
  columnActiveCursor?: string | null;
}

/** Capture `isExpanded` for every node in the current tree so the
 *  state can be re-applied after `setTreeData` rebuilds the tree from
 *  fresh engine data (tab switch, live edit, etc.). Exported for tests. */
export function snapshotExpansionState(root: GridNode): Map<string, boolean> {
  const out = new Map<string, boolean>();
  const walk = (n: GridNode): void => {
    out.set(n.nodeId, n.isExpanded);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** Re-apply a previously-captured expansion state onto a freshly
 *  built tree. Nodes that do not appear in the snapshot keep their
 *  default `expandDepth` initial state. Exported for tests. */
export function applyExpansionState(root: GridNode, snap: Map<string, boolean>): void {
  const walk = (n: GridNode): void => {
    const saved = snap.get(n.nodeId);
    if (saved !== undefined) n.isExpanded = saved;
    for (const c of n.children) walk(c);
  };
  walk(root);
}

export class GridViewPanel implements vscode.CustomTextEditorProvider {
  public static readonly viewType = 'xmlVisualEditor.gridView';
  /** Debounce window for live-edit reconcile. Exposed for tests. */
  public static readonly LIVE_EDIT_DEBOUNCE_MS = 150;
  private readonly model = new GridModel();
  private readonly renderer = new GridRenderer();
  /** Session-only toggle state (tableMode / flip) per webview.
   *  Lost on webview dispose (no persistence). */
  private readonly toggleState = createToggleState();
  /** Latest selection snapshot reported by the webview. Stored for use
   *  by `+`/`-` batching, status bar, etc. */
  private lastSelection: SelectionSnapshot = { nodeIds: [], anchor: null, activeCursor: null };

  /** Read-only access to the most recent webview-reported selection. */
  getLastSelection(): SelectionSnapshot {
    return this.lastSelection;
  }

  constructor(
    private readonly extensionContext: vscode.ExtensionContext,
    private readonly engineClient: EngineClient,
  ) {
    this.renderer.setToggleState(this.toggleState);
  }

  /** Extension URI root — used by future getUri() helper for webview resources. */
  get extensionUri(): vscode.Uri {
    return this.extensionContext.extensionUri;
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken,
  ): Promise<void> {
    webviewPanel.webview.options = { enableScripts: true };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview);

    // Debounce live text-edit reconcile so each keystroke does not
    // trigger a full engine round-trip. 150ms is enough to feel live
    // while coalescing fast typing bursts. Uses `document.getText()` so
    // the reconcile sees the IN-MEMORY document (not on-disk contents).
    let liveEditTimer: NodeJS.Timeout | undefined;
    const changeDocSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) return;
      if (liveEditTimer) clearTimeout(liveEditTimer);
      liveEditTimer = setTimeout(() => {
        liveEditTimer = undefined;
        void this.updateWebview(webviewPanel.webview, document);
      }, GridViewPanel.LIVE_EDIT_DEBOUNCE_MS);
    });

    // Listen for webview messages
    webviewPanel.webview.onDidReceiveMessage((message: unknown) => {
      const msg = message as {
        type?: string;
        nodeId?: string;
        nodeType?: string;
        selection?: SelectionSnapshot;
        direction?: '+' | '-';
        nodeIds?: string[];
        parentNodeId?: string;
        kind?: 'tableMode' | 'flip';
        value?: boolean;
      };
      switch (msg.type) {
        case 'toggleExpand': {
          if (msg.nodeId) {
            const actualNodeId = msg.nodeId.replace(/#group$/, '');
            const node = this.model.findNode(actualNodeId);
            if (node) {
              node.toggleExpanded();
              const html = this.renderer.render(this.model);
              void webviewPanel.webview.postMessage({ type: 'updateTreeData', html });
              this.postReconcile(webviewPanel.webview);
            }
          }
          break;
        }
        case 'batchToggleExpand': {
          const rawIds = Array.isArray(msg.nodeIds) ? msg.nodeIds : [];
          const direction = msg.direction === '+' ? '+' : '-';
          const changed: string[] = [];
          for (const raw of rawIds) {
            const actualId = raw.replace(/#group$/, '');
            const node = this.model.findNode(actualId);
            if (!node) {
              continue;
            }
            if (node.type === 'comment') {
              continue;
            }
            // Expandable when it has children OR attributes (matches the
            // chevron-rendering rule in GridNode.constructor: `hasContent`).
            const expandable = node.hasChildren || node.hasAttributes;
            if (!expandable) {
              continue;
            }
            if (direction === '+' && !node.isExpanded) {
              node.toggleExpanded();
              changed.push(raw);
            } else if (direction === '-' && node.isExpanded) {
              node.toggleExpanded();
              changed.push(raw);
            }
          }
          getGridViewOutputChannel().appendLine(
            `[grid-view] batchToggleExpand direction=${direction} ` +
              `requested=${rawIds.length} changed=${changed.length}`,
          );
          if (changed.length > 0) {
            const html = this.renderer.render(this.model);
            void webviewPanel.webview.postMessage({ type: 'updateTreeData', html });
            this.postReconcile(webviewPanel.webview);
          }
          break;
        }
        case 'nodeSelected': {
          // Future: sync with helper panels
          break;
        }
        case 'toggleStateChanged': {
          // Session-only toggle-state update from the webview.
          // Re-render from the existing in-memory GridModel; no engine
          // fetch, no expansion-state rebuild.
          if (msg.parentNodeId && msg.kind && typeof msg.value === 'boolean') {
            if (msg.kind === 'tableMode') {
              this.toggleState.setTableMode(msg.parentNodeId, msg.value);
            } else {
              this.toggleState.setFlipped(msg.parentNodeId, msg.value);
            }
            this.rerenderFromExistingModel(webviewPanel.webview);
          }
          break;
        }
        case 'selectionChanged': {
          if (msg.selection) {
            this.lastSelection = msg.selection;
            const n = msg.selection.nodeIds.length;
            // Column-axis state lives on the same snapshot (columnIds /
            // columnAnchor / columnActiveCursor). Log both axes so the
            // trace reflects the actual painted state — `size=0` on a
            // row-axis-empty snapshot used to misleadingly suggest
            // "no selection" even when a column was selected.
            const colIds = msg.selection.columnIds ?? [];
            const colCursor = msg.selection.columnActiveCursor ?? null;
            const colAnchor = msg.selection.columnAnchor ?? null;
            getGridViewOutputChannel().appendLine(
              `[grid-view] selectionChanged rows=${n} ` +
                `anchor=${msg.selection.anchor ?? 'null'} ` +
                `cursor=${msg.selection.activeCursor ?? 'null'} ` +
                `columns=${colIds.length} ` +
                `colAnchor=${colAnchor ?? 'null'} ` +
                `colCursor=${colCursor ?? 'null'}`,
            );
          }
          break;
        }
      }
    });

    webviewPanel.onDidDispose(() => {
      if (liveEditTimer) clearTimeout(liveEditTimer);
      changeDocSub.dispose();
    });

    // Webview visibility transitions MUST NOT trigger a full engine
    // refetch + setTreeData rebuild. With `retainContextWhenHidden:
    // true` (see extension.ts registerCustomEditorProvider
    // webviewOptions), the webview DOM + JS state are preserved while
    // the tab is backgrounded, so the user's expansion, drill-down
    // openings, row/column selection, and table-mode/flip toggles
    // remain intact in the retained DOM. A blanket refetch on every
    // visibility flip would overwrite that DOM with freshly-rendered
    // HTML and — in practice — clobber expansion state (the original
    // snapshot/restore dance relied on stable nodeIds across the
    // engine round-trip but empirically failed often enough that users
    // saw every expansion collapse on tab switch). Live-edit reconcile
    // is independently handled by the debounced
    // `onDidChangeTextDocument` listener above, so external content
    // changes are still picked up. The only defensive case is a panel
    // that somehow became visible without an initial load having
    // populated the model — then we do a one-shot catch-up fetch so
    // the grid isn't left on the "Grid View loading..." placeholder.
    webviewPanel.onDidChangeViewState(() => {
      if (webviewPanel.visible && this.model.getRoot() === null) {
        void this.updateWebview(webviewPanel.webview, document);
      }
    });

    // Initial data load
    await this.updateWebview(webviewPanel.webview, document);
  }

  async requestGridData(
    webview: vscode.Webview,
    documentId: string,
    documentContent: string,
  ): Promise<void> {
    if (!this.engineClient.isReady()) {
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            disposable.dispose();
            reject(new Error('Engine startup timeout'));
          }, 30000);
          const disposable = this.engineClient.onReady(() => {
            clearTimeout(timer);
            disposable.dispose();
            resolve();
          });
          // Re-check: engine may have become ready between isReady() and listener registration
          if (this.engineClient.isReady()) {
            clearTimeout(timer);
            disposable.dispose();
            resolve();
          }
        });
      } catch {
        return;
      }
    }
    // Ensure document is loaded in engine (needed on restart when no text editor triggers document.update)
    try {
      await this.engineClient.sendRequest('document.update', {
        doc_id: documentId,
        content: documentContent,
      });
    } catch {
      // Engine may not support this — continue anyway
    }
    try {
      const t0 = Date.now();
      const treeData = await this.engineClient.sendRequest('gridView.getTreeData', {
        documentId,
      });
      const tFetched = Date.now();
      if (treeData) {
        // Capture pre-rebuild expansion state (tab switch / live edit)
        // so user-driven expand/collapse survives a fresh
        // `setTreeData`. Default-depth semantics still apply to any
        // nodes not present in the previous snapshot.
        const prevRoot = this.model.getRoot();
        const savedExpansion = prevRoot ? snapshotExpansionState(prevRoot) : null;
        this.model.setTreeData(treeData as GridTreeNodeData);
        const newRoot = this.model.getRoot();
        if (newRoot && savedExpansion && savedExpansion.size > 0) {
          applyExpansionState(newRoot, savedExpansion);
        }
        const tModel = Date.now();
        const html = this.renderer.render(this.model);
        const tRender = Date.now();
        void webview.postMessage({ type: 'updateTreeData', html });
        this.postReconcile(webview);
        const msg =
          `[grid-view] fetch=${tFetched - t0}ms model=${tModel - tFetched}ms ` +
          `render=${tRender - tModel}ms htmlSize=${html.length}`;
        console.log(msg);
        // Surface the timing in the VS Code Output channel so users can
        // read it without opening DevTools (which is blocked while the
        // grid webview has focus in the editor group).
        getGridViewOutputChannel().appendLine(msg);
      }
    } catch {
      // Log but don't crash — document may not be loaded in engine yet
    }
  }

  private async updateWebview(
    webview: vscode.Webview,
    document: vscode.TextDocument,
  ): Promise<void> {
    await this.requestGridData(webview, document.uri.toString(), document.getText());
  }

  /** Re-emit HTML from the in-memory `GridModel` without fetching from
   *  the engine. Triggered by `toggleStateChanged` messages so
   *  table-mode / flip flips feel instant and don't perturb expansion
   *  state or selection. */
  private rerenderFromExistingModel(webview: vscode.Webview): void {
    if (!this.model.getRoot()) return;
    const html = this.renderer.render(this.model);
    void webview.postMessage({ type: 'updateTreeData', html });
    this.postReconcile(webview);
  }

  /** Tell the webview to reconcile its selection model against the
   *  current tree. Called after every re-render (updateTreeData).
   *  Includes a per-id content fingerprint map so the webview can drop
   *  selections whose path survived but whose content changed. */
  private postReconcile(webview: vscode.Webview): void {
    const root = this.model.getRoot();
    const existingIds: string[] = root ? collectRenderableIds(root) : [];
    const fallbackFirstVisibleId = existingIds.length > 0 ? existingIds[0] : null;
    const fpMap = computeFingerprints(this.model);
    const fingerprints: Record<string, string> = {};
    for (const [id, fp] of fpMap) {
      fingerprints[id] = fp;
    }
    void webview.postMessage({
      type: 'reconcileSelection',
      existingIds,
      fallbackFirstVisibleId,
      fingerprints,
    });
  }

  private getHtmlForWebview(webview: vscode.Webview): string {
    const nonce = getNonce();

    // Class-based depth rules (d-0..d-30) provide a CSP-safe fallback for
    // `style="--depth: N"` inline attributes. If the webview CSP ever blocks
    // element-level inline styles (e.g. if 'unsafe-inline' is removed from
    // style-src), the grid still renders indentation correctly because each
    // row also carries a `d-N` class whose rule sets the same CSS variable.
    let depthRules = '';
    for (let d = 0; d <= 30; d++) {
      depthRules += `.g-row.d-${d} { --depth: ${d}; } `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    ${GRID_THEME_CSS}
    ${GRID_STATIC_CSS}
    ${depthRules}
  </style>
</head>
<body>
  <div id="grid-container">
    <div class="loading">Grid View loading...</div>
  </div>
  <script nonce="${nonce}">
    ${GRID_VIEW_WEBVIEW_SCRIPT}
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

