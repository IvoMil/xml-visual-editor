import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { CursorContext } from '../services/cursor-tracking-service';
import { getPanelFontCss, getXmlTokenColors } from '../shared/panel-utils';

interface NodeDetails {
  name: string;
  type_name: string;
  documentation: string;
  xpath: string;
  min_occurs: number;
  max_occurs: number | 'unbounded';
  enum_values?: string[];
  base_type?: string;
  compositor_context?: {
    parent_compositor: string;
    parent_element: string;
    preceding_siblings: string[];
    following_siblings: string[];
    choice_alternatives: string[];
  };
  instance_state?: {
    current_count: number;
    is_satisfied: boolean;
    is_exhausted: boolean;
    can_insert: boolean;
    content_complete: boolean;
    missing_required: string[];
  };
  restrictions?: {
    min_inclusive?: string;
    max_inclusive?: string;
    min_exclusive?: string;
    max_exclusive?: string;
    min_length?: number;
    max_length?: number;
    pattern?: string;
  };
  appinfo?: string;
}

export class InfoPanelProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private lastContext: CursorContext | undefined;
  private previewMode = false;
  private updateGeneration = 0;

  constructor(private readonly engineClient: EngineClient) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getBaseHtml();

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible && this.lastContext) {
        void this.update(this.lastContext);
      }
    });

    // If a cursor context was received before the view was ready, update now
    if (this.lastContext) {
      void this.update(this.lastContext);
    }
  }

  async update(context: CursorContext): Promise<void> {
    ++this.updateGeneration;
    this.lastContext = context;
    this.previewMode = false;

    if (!this.view) {
      return;
    }

    if (!context.schemaId) {
      void this.view.webview.postMessage({ type: 'noSchema' });
      return;
    }

    if (!context.elementName) {
      void this.view.webview.postMessage({ type: 'clear' });
      return;
    }

    await this.fetchAndDisplay(context.elementName, context.schemaId, context.elementPath);
  }

  async showElementInfo(elementName: string, schemaId: string): Promise<void> {
    this.previewMode = true;
    const elementPath = this.lastContext
      ? [...this.lastContext.elementPath, elementName]
      : [elementName];
    await this.fetchAndDisplay(elementName, schemaId, elementPath);
  }

  private async fetchAndDisplay(
    elementName: string,
    schemaId: string,
    elementPath: string[],
  ): Promise<void> {
    if (!this.view || !this.engineClient.isReady()) {
      return;
    }

    const generation = this.updateGeneration;

    // Show loading spinner
    void this.view.webview.postMessage({
      type: 'loading',
      message: 'Loading element details...',
    });

    try {
      const result = (await this.engineClient.sendRequest(
        'helper.getNodeDetails',
        {
          schema_id: schemaId,
          element_name: elementName,
          element_path: elementPath,
          doc_id: this.lastContext?.documentUri,
        },
        30000,
      )) as NodeDetails;

      if (generation !== this.updateGeneration) return; // superseded by newer update

      if (!result) {
        void this.view.webview.postMessage({
          type: 'error',
          message: 'No details returned for this element',
        });
        return;
      }

      void this.view.webview.postMessage({
        type: 'updateInfo',
        details: result,
        isPreview: this.previewMode,
      });
    } catch (err) {
      if (generation !== this.updateGeneration) return;
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timed out');
      void this.view.webview.postMessage({
        type: isTimeout ? 'info' : 'error',
        message: isTimeout
          ? 'Loading element details — schema may still be processing. Try again shortly.'
          : message,
      });
    }
  }

  sendColors(): void {
    if (this.view) {
      const colors = getXmlTokenColors();
      void this.view.webview.postMessage({
        type: 'updateColors',
        tagColor: colors.tagColor,
        attrColor: colors.attrColor,
      });
    }
  }

  private getBaseHtml(): string {
    const colors = getXmlTokenColors();
    const fontCss = getPanelFontCss();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
    :root {
      --xve-tag-color: ${colors.tagColor};
      --xve-attr-color: ${colors.attrColor};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 12px);
      padding: 10px;
      line-height: 1.5;
    }
    .empty {
      color: var(--vscode-descriptionForeground, #888);
      font-style: italic;
      padding: 16px 0;
      text-align: center;
    }
    h1 { display: flex; align-items: center; gap: 6px; font-size: inherit;
      flex-wrap: wrap; margin-bottom: 8px; color: var(--xve-tag-color, #4EC9B0); font-weight: normal; }
    h1.required { font-weight: 700; }
    h2 { font-size: 0.95em; margin: 12px 0 6px 0; padding-bottom: 3px;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #444); }
    .badge {
      display: inline-block; font-size: 10px; padding: 1px 6px;
      border-radius: 3px; font-weight: 600;
    }
    .badge-type {
      background: var(--vscode-badge-background, #4d4d4d);
      color: var(--vscode-badge-foreground, #ccc);
    }
    .badge-required { background: #2e6b30; color: #8ddb8f; }
    .badge-optional { background: #4a3d1e; color: #d4a84b; }
    .info-grid { display: grid; grid-template-columns: auto 1fr;
      gap: 3px 10px; margin-top: 6px; }
    .info-label { color: var(--vscode-descriptionForeground, #888);
      white-space: nowrap; font-size: 11px; }
    .info-value { font-size: 11px; }
    .xpath { font-family: var(--vscode-editor-font-family, monospace);
      font-size: 11px; word-break: break-all; }
    .doc-text { margin-top: 6px; white-space: pre-wrap; line-height: 1.4; font-size: 11px; }
    .muted { color: var(--vscode-descriptionForeground, #888); font-style: italic; }
    .error-msg { color: var(--vscode-errorForeground, #f44); }
    .info-msg { color: var(--vscode-descriptionForeground, #999); font-style: italic; padding: 8px; }
    details { margin: 8px 0; }
    details summary { cursor: pointer; user-select: none; }
    details summary h2 { display: inline; margin: 0; border-bottom: none; }
    details[open] summary { margin-bottom: 4px; }
  </style>
  <style>${fontCss}</style>
</head>
<body>
  <div id="content">
    <p class="empty">Move the cursor into an XML element to see schema details.</p>
  </div>
  <script>
    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function renderInfo(d, isPreview) {
      const content = document.getElementById('content');
      const name = esc(d.name || '');
      const typeName = esc(d.type_name || '');
      const baseType = esc(d.base_type || '');
      const xpath = esc(d.xpath || '');
      const doc = d.documentation ? esc(d.documentation) : null;
      const min = d.min_occurs != null ? d.min_occurs : 0;
      const max = d.max_occurs != null ? d.max_occurs : 1;
      const isRequired = min >= 1;
      const occ = min + '..' + (max === 'unbounded' ? '*' : max);

      // 1. Header
      let html = '<h1 class="' + (isRequired ? 'required' : '') + '">&lt;' + esc(name) + '&gt;'
        + ' <span class="badge badge-type">' + esc(typeName || 'element') + '</span>'
        + ' <span class="badge ' + (isRequired ? 'badge-required' : 'badge-optional') + '">'
        + (isRequired ? 'Required' : 'Optional') + '</span>';
      if (isPreview) {
        html += ' <span class="badge" style="background:#555;color:#aaa">preview</span>';
      }
      html += '</h1>';

      // 2. Documentation
      if (doc) {
        html += '<h2>Documentation</h2>';
        html += '<div class="doc-text">' + doc + '</div>';
      }

      // App Info
      if (d.appinfo) {
        html += '<h2>App Info</h2>';
        html += '<div class="doc-text">' + esc(d.appinfo) + '</div>';
      }

      // Allowed Values (for enum types)
      if (d.enum_values && d.enum_values.length > 0) {
        html += '<h2>Allowed Values (' + d.enum_values.length + ')</h2>';
        html += '<div style="margin-top:4px;font-size:11px;">';
        html += d.enum_values.map(function(v) {
          return '<span class="badge badge-type" style="margin:2px">' + esc(v) + '</span>';
        }).join(' ');
        html += '</div>';
      }

      // Value Constraints (restrictions)
      if (d.restrictions && Object.keys(d.restrictions).length > 0) {
        html += '<h2>Value Constraints</h2><div class="info-grid">';
        const r = d.restrictions;
        if (r.min_inclusive != null) {
          html += '<span class="info-label">Min (inclusive)</span><span class="info-value">' + esc(r.min_inclusive) + '</span>';
        }
        if (r.max_inclusive != null) {
          html += '<span class="info-label">Max (inclusive)</span><span class="info-value">' + esc(r.max_inclusive) + '</span>';
        }
        if (r.min_exclusive != null) {
          html += '<span class="info-label">Min (exclusive)</span><span class="info-value">&gt; ' + esc(r.min_exclusive) + '</span>';
        }
        if (r.max_exclusive != null) {
          html += '<span class="info-label">Max (exclusive)</span><span class="info-value">&lt; ' + esc(r.max_exclusive) + '</span>';
        }
        if (r.min_length != null) {
          html += '<span class="info-label">Min length</span><span class="info-value">' + r.min_length + '</span>';
        }
        if (r.max_length != null) {
          html += '<span class="info-label">Max length</span><span class="info-value">' + r.max_length + '</span>';
        }
        if (r.pattern != null) {
          html += '<span class="info-label">Pattern</span><span class="info-value" style="font-family:var(--vscode-editor-font-family,monospace)">' + esc(r.pattern) + '</span>';
        }
        html += '</div>';
      }

      // 3. General info grid
      html += '<h2>General</h2><div class="info-grid">';
      html += '<span class="info-label">Type name</span><span class="info-value">'
        + (typeName || '<span class="muted">\\u2014</span>') + '</span>';
      if (baseType) {
        html += '<span class="info-label">Base type</span><span class="info-value">'
          + baseType + '</span>';
      }
      if (d.namespace_constraint) {
        html += '<span class="info-label">Namespace</span><span class="info-value">'
          + esc(d.namespace_constraint) + '</span>';
      }
      if (d.process_contents) {
        html += '<span class="info-label">Process contents</span><span class="info-value">'
          + esc(d.process_contents) + '</span>';
      }
      html += '<span class="info-label">XPath</span><span class="info-value xpath">'
        + (xpath || '<span class="muted">\\u2014</span>') + '</span>';
      const occDisplay = d.instance_state
        ? occ + ' (currently ' + d.instance_state.current_count + ' present)'
        : occ;
      html += '<span class="info-label">Occurrence</span><span class="info-value">'
        + occDisplay + '</span>';
      html += '</div>';

      // 4. Compositor Context
      if (d.compositor_context && d.compositor_context.parent_compositor) {
        html += '<details><summary><h2 style="display:inline">Compositor Context</h2></summary>';
        html += '<div class="info-grid">';
        html += '<span class="info-label">In</span><span class="info-value">'
          + esc(d.compositor_context.parent_compositor) + ' (under &lt;'
          + esc(d.compositor_context.parent_element || '') + '&gt;)</span>';
        if (d.compositor_context.preceding_siblings && d.compositor_context.preceding_siblings.length > 0) {
          html += '<span class="info-label">After</span><span class="info-value">'
            + d.compositor_context.preceding_siblings.map(function(s) { return esc(s); }).join(', ') + '</span>';
        }
        if (d.compositor_context.following_siblings && d.compositor_context.following_siblings.length > 0) {
          html += '<span class="info-label">Before</span><span class="info-value">'
            + d.compositor_context.following_siblings.map(function(s) { return esc(s); }).join(', ') + '</span>';
        }
        if (d.compositor_context.choice_alternatives && d.compositor_context.choice_alternatives.length > 0) {
          html += '<span class="info-label">Alternatives</span><span class="info-value">'
            + d.compositor_context.choice_alternatives.map(function(s) { return esc(s); }).join(', ') + '</span>';
        }
        html += '</div></details>';
      }

      // 5. Instance State
      if (d.instance_state) {
        const ist = d.instance_state;
        const stateIcon = ist.content_complete
          ? ''
          : ' <span title="Missing: ' + (ist.missing_required || []).map(function(s) { return esc(s); }).join(', ') + '">\\u26A0\\uFE0F</span>';
        html += '<details><summary><h2 style="display:inline">Instance State' + stateIcon + '</h2></summary>';
        html += '<div class="info-grid">';
        html += '<span class="info-label">Count</span><span class="info-value">'
          + ist.current_count + ' of ' + occ + '</span>';
        html += '<span class="info-label">Satisfied</span><span class="info-value">'
          + (ist.is_satisfied ? '\\u2713 yes' : '\\u2717 no') + '</span>';
        html += '<span class="info-label">Can insert</span><span class="info-value">'
          + (ist.can_insert ? '\\u2713 yes' : '\\u2717 no') + '</span>';
        html += '<span class="info-label">Content complete</span><span class="info-value">'
          + (ist.content_complete ? '\\u2713 yes' : '\\u2717 no') + '</span>';
        if (ist.missing_required && ist.missing_required.length > 0) {
          html += '<span class="info-label">Missing required</span><span class="info-value">'
            + ist.missing_required.map(function(s) { return esc(s); }).join(', ') + '</span>';
        }
        html += '</div></details>';
      }

      content.innerHTML = html;
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      const content = document.getElementById('content');
      if (msg.type === 'updateInfo') {
        try {
          renderInfo(msg.details, !!msg.isPreview);
        } catch (e) {
          content.innerHTML = '<p class="error-msg">Render error: ' + esc(String(e)) + '</p>';
        }
      } else if (msg.type === 'clear') {
        content.innerHTML = '<p class="empty">Move the cursor into an XML element to see schema details.</p>';
      } else if (msg.type === 'noSchema') {
        content.innerHTML = '<p class="empty">No schema available for this document.</p>';
      } else if (msg.type === 'loading') {
        content.innerHTML = '<p class="info-msg">' + esc(msg.message) + '</p>';
      } else if (msg.type === 'info') {
        content.innerHTML = '<p class="info-msg">' + esc(msg.message) + '</p>';
      } else if (msg.type === 'error') {
        content.innerHTML = '<p class="error-msg">Failed to load details: ' + esc(msg.message) + '</p>';
      } else if (msg.type === 'updateColors') {
        document.documentElement.style.setProperty('--xve-tag-color', msg.tagColor);
        document.documentElement.style.setProperty('--xve-attr-color', msg.attrColor);
      }
    });
  </script>
</body>
</html>`;
  }
}
