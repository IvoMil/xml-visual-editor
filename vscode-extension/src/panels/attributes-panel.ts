import * as vscode from 'vscode';
import { EngineClient } from '../engine/engine-client';
import { CursorContext } from '../services/cursor-tracking-service';
import { getPanelFontCss, getXmlTokenColors } from '../shared/panel-utils';

interface AttributesPanelData {
  element_name: string;
  attributes: AttributeInstanceInfo[];
  min_occurs?: number;
}

interface AttributeInstanceInfo {
  name: string;
  type_name: string;
  use: string;
  is_set: boolean;
  current_value: string;
  default_value: string;
  fixed_value: string;
  enum_values: string[];
  documentation: string;
}

export class AttributesPanelProvider implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private lastContext: CursorContext | undefined;
  private updateGeneration = 0;

  constructor(
    private readonly engineClient: EngineClient,
    private readonly onAttributeEditCallback: (
      name: string,
      value: string,
      remove: boolean,
    ) => Promise<void>,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getWebviewHtml();

    webviewView.webview.onDidReceiveMessage(
      async (message: { type: string; name: string; value: string }) => {
        switch (message.type) {
          case 'updateAttribute':
            await this.onAttributeEditCallback(message.name, message.value, false);
            break;
          case 'removeAttribute':
            await this.onAttributeEditCallback(message.name, '', true);
            break;
        }
      },
    );

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

  async showElementAttributes(
    elementName: string,
    schemaId: string,
    elementPath: string[],
  ): Promise<void> {
    if (!this.view || !this.engineClient.isReady()) {
      return;
    }

    void this.view.webview.postMessage({
      type: 'loading',
      message: 'Loading attributes...',
    });

    try {
      const result = (await this.engineClient.sendRequest(
        'helper.getAttributesPanelData',
        {
          schema_id: schemaId,
          element_name: elementName,
          element_path: elementPath,
          doc_id: this.lastContext?.documentUri,
        },
        30000,
      )) as AttributesPanelData;

      void this.view.webview.postMessage({
        type: 'updateAttributes',
        elementName: result?.element_name ?? elementName,
        attributes: result?.attributes ?? [],
        minOccurs: result?.min_occurs ?? 1,
        cursorContext: null,
        currentAttribute: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timed out');
      void this.view.webview.postMessage({
        type: isTimeout ? 'info' : 'error',
        message: isTimeout
          ? 'Loading attributes — schema may still be processing. Try again shortly.'
          : message,
      });
    }
  }

  async update(context: CursorContext): Promise<void> {
    const generation = ++this.updateGeneration;
    this.lastContext = context;

    if (!this.view) {
      return;
    }

    if (!context.schemaId) {
      void this.view.webview.postMessage({ type: 'clear' });
      return;
    }

    if (!context.elementName) {
      void this.view.webview.postMessage({ type: 'clear' });
      return;
    }

    if (!this.engineClient.isReady()) {
      void this.view.webview.postMessage({ type: 'clear' });
      return;
    }

    void this.view.webview.postMessage({
      type: 'loading',
      message: 'Loading attributes...',
    });

    try {
      const result = (await this.engineClient.sendRequest(
        'helper.getAttributesPanelData',
        {
          schema_id: context.schemaId,
          element_name: context.elementName,
          element_path: context.elementPath,
          doc_id: context.documentUri,
        },
        30000,
      )) as AttributesPanelData;

      if (generation !== this.updateGeneration) return; // superseded by newer update

      void this.view.webview.postMessage({
        type: 'updateAttributes',
        elementName: result?.element_name ?? context.elementName,
        attributes: result?.attributes ?? [],
        minOccurs: result?.min_occurs ?? 1,
        cursorContext: context.cursorContext ?? null,
        currentAttribute: context.currentAttribute ?? null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timed out');
      void this.view.webview.postMessage({
        type: isTimeout ? 'info' : 'error',
        message: isTimeout
          ? 'Loading attributes — schema may still be processing. Try again shortly.'
          : message,
      });
    }
  }

  sendMessage(message: Record<string, unknown>): void {
    if (this.view) {
      void this.view.webview.postMessage(message);
    }
  }

  sendColors(): void {
    if (this.view) {
      const colors = getXmlTokenColors();
      void this.view.webview.postMessage({
        type: 'updateColors',
        tagColor: colors.tagColor,
        attrColor: colors.attrColor,
        attrValueColor: colors.attrValueColor,
      });
    }
  }

  private getWebviewHtml(): string {
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
      --xve-attr-value-color: ${colors.attrValueColor};
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size, 12px);
      padding: 8px;
    }
    .element-header {
      color: var(--xve-tag-color, #4EC9B0);
      margin-bottom: 8px;
    }
    .element-header.required {
      font-weight: 700;
    }
    .empty {
      color: var(--vscode-descriptionForeground, #888);
      font-style: italic;
      padding: 8px 0;
    }
    .error-msg {
      color: var(--vscode-errorForeground, #f44);
      padding: 8px 0;
    }
    .info-msg {
      color: var(--vscode-descriptionForeground, #999);
      font-style: italic;
      padding: 8px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left; padding: 3px 4px; font-weight: 600;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #555);
      color: var(--vscode-descriptionForeground, #999); font-size: 0.9em;
    }
    td {
      padding: 2px 4px; vertical-align: middle;
      border-bottom: 1px solid var(--vscode-editorWidget-border, #2a2a2a);
    }
    tr:hover { background: var(--vscode-list-hoverBackground, #2a2d2e); }
    .req-ind-set { color: #8ddb8f; font-size: 14px; cursor: default; }
    .req-ind-unset { color: #f44747; font-size: 14px; cursor: default; }
    .opt-ind { color: var(--vscode-descriptionForeground, #888); font-size: 14px; cursor: default; }
    .attr-name { font-family: var(--vscode-editor-font-family, monospace); color: var(--xve-attr-color, #9CDCFE); }
    .attr-name.req { font-weight: 700; }
    .attr-name.unsatisfied { color: var(--vscode-editorWarning-foreground, #cca700); }
    .fixed-icon { font-size: 12px; margin-left: 2px; }
    .fixed-value { color: var(--xve-attr-value-color); font-style: italic; }
    tr.focused-attr {
      background: var(--vscode-list-activeSelectionBackground, #094771);
      color: var(--vscode-list-activeSelectionForeground, #fff);
    }
    .attr-type { color: var(--vscode-descriptionForeground, #999); font-style: italic; }
    .attr-value input, .attr-value select {
      width: 100%;
      background: var(--vscode-input-background, #3c3c3c);
      color: var(--xve-attr-value-color);
      border: 1px solid var(--vscode-input-border, transparent);
      padding: 1px 4px;
      font-family: var(--vscode-editor-font-family, monospace);
      outline: none;
    }
    .attr-value input:focus, .attr-value select:focus {
      border-color: var(--vscode-focusBorder, #007acc);
    }
    .legend { margin-top: 6px; font-size: 10px; color: var(--vscode-descriptionForeground, #888); }
    .attr-doc { color: var(--vscode-descriptionForeground, #999); font-style: italic; }
    tr.focused-attr .attr-type,
    tr.focused-attr .attr-doc {
      color: var(--vscode-list-activeSelectionForeground, #fff);
    }
    .warning-icon { font-size: 14px; vertical-align: middle; cursor: default; }
    .doc-indicator {
      display: inline-block; width: 12px; height: 12px; line-height: 12px;
      font-size: 8px; font-weight: 700; font-style: normal;
      text-align: center; border-radius: 50%; margin-left: 3px; vertical-align: middle;
      background: var(--vscode-textLink-foreground, #3794ff); color: #fff; cursor: default;
      opacity: 0.7;
    }
  </style>
  <style>${fontCss}</style>
</head>
<body>
  <div id="header" class="element-header"></div>
  <div id="content">
    <p class="empty">Move the cursor into an XML element to see its attributes.</p>
  </div>
  <script>
    const vscode = acquireVsCodeApi();

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    var lastElementName = null;
    var lastAttributes = null;
    var lastMinOccurs = 1;

    function renderAttributes(elementName, attributes, minOccurs) {
      lastElementName = elementName;
      lastAttributes = attributes;
      lastMinOccurs = minOccurs;
      const header = document.getElementById('header');
      const missingRequired = (attributes || []).filter(a => a.use === 'required' && !a.is_set);
      const warningIcon = missingRequired.length > 0
        ? ' <span class="warning-icon" title="Missing required: ' + missingRequired.map(a => esc(a.name)).join(', ') + '">\u26A0\uFE0F</span>'
        : '';
      header.innerHTML = esc('<' + elementName + '>') + warningIcon;
      header.className = 'element-header' + (minOccurs >= 1 ? ' required' : '');

      const content = document.getElementById('content');
      if (!attributes || attributes.length === 0) {
        content.innerHTML = '<p class="empty">No attributes defined for this element.</p>';
        return;
      }

      var state = vscode.getState() || {};
      var showType = state.typeVisible !== false;
      var showDoc = state.docVisible !== false;
      let html = '<table><thead><tr>'
        + '<th style="width:18px" title="required / optional"></th>'
        + '<th>Name</th><th style="width:16px;padding:0"></th><th>Value</th>'
        + (showType ? '<th>Type</th>' : '')
        + (showDoc ? '<th>Doc</th>' : '')
        + '</tr></thead><tbody>';

      for (const attr of attributes) {
        const ind = attr.use === 'required'
          ? (attr.is_set
            ? '<span class="req-ind-set" title="Required (set)">\\u25CF</span>'
            : '<span class="req-ind-unset" title="Required (not set)">\\u25CF</span>')
          : '<span class="opt-ind" title="Optional">\\u25CB</span>';

        const nameClass = attr.use === 'required'
          ? (attr.is_set ? 'attr-name req' : 'attr-name req unsatisfied')
          : 'attr-name';

        const fixedIcon = attr.fixed_value
          ? ' <span class="fixed-icon" title="Fixed: ' + esc(attr.fixed_value) + '">\\uD83D\\uDD12</span>'
          : '';
        const typeText = esc(attr.type_name || '');

        let curVal;
        let inputPlaceholder;
        if (attr.current_value != null && attr.current_value !== '') {
          curVal = String(attr.current_value);
          inputPlaceholder = '';
        } else if (attr.default_value != null && attr.default_value !== '') {
          curVal = '';
          inputPlaceholder = esc(String(attr.default_value)) + ' (default)';
        } else {
          curVal = '';
          inputPlaceholder = attr.is_set ? '' : '(not set)';
        }

        let valCell;
        if (attr.fixed_value) {
          valCell = '<span class="fixed-value">' + esc(attr.fixed_value) + '</span>';
        } else if (attr.enum_values && attr.enum_values.length > 0) {
          valCell = '<select data-attr="' + esc(attr.name) + '" onchange="onChange(this)">';
          if (!attr.is_set) {
            const defLabel = (attr.default_value != null && attr.default_value !== '')
              ? '(default: ' + esc(String(attr.default_value)) + ')'
              : '(not set)';
            valCell += '<option value="">' + defLabel + '</option>';
          }
          for (const ev of attr.enum_values) {
            const sel = (attr.is_set && ev === curVal) ? ' selected' : '';
            valCell += '<option value="' + esc(ev) + '"' + sel + '>' + esc(ev) + '</option>';
          }
          valCell += '</select>';
        } else {
          valCell = '<input type="text" data-attr="' + esc(attr.name) + '" value="'
            + esc(curVal) + '" placeholder="' + inputPlaceholder + '" onchange="onChange(this)">';
        }

        var docText = attr.documentation ? esc(attr.documentation) : '';
        var rowTitle = attr.documentation ? ' title="' + esc(attr.documentation) + '"' : '';
        var docInd = attr.documentation ? '<span class="doc-indicator">i</span>' : '';
        html += '<tr' + rowTitle + '><td>' + ind + '</td>'
          + '<td class="' + nameClass + '">' + esc(attr.name) + fixedIcon + '</td>'
          + '<td style="padding:0;text-align:center">' + docInd + '</td>'
          + '<td class="attr-value">' + valCell + '</td>'
          + (showType ? '<td class="attr-type">' + typeText + '</td>' : '')
          + (showDoc ? '<td class="attr-doc">' + docText + '</td>' : '')
          + '</tr>';
      }

      html += '</tbody></table>';
      html += '<p class="legend">\\u25CF required \\u00A0\\u00A0 \\u25CB optional</p>';
      content.innerHTML = html;
    }

    function onChange(el) {
      vscode.postMessage({ type: 'updateAttribute', name: el.dataset.attr, value: el.value });
    }

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'updateAttributes') {
        renderAttributes(msg.elementName, msg.attributes, msg.minOccurs);
        if ((msg.cursorContext === 'C' || msg.cursorContext === 'D') && msg.currentAttribute) {
          setTimeout(() => {
            const rows = document.querySelectorAll('tbody tr');
            for (const row of rows) {
              const input = row.querySelector('[data-attr]');
              if (input && input.dataset.attr === msg.currentAttribute) {
                row.classList.add('focused-attr');
                row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                break;
              }
            }
          }, 50);
        }
      } else if (msg.type === 'clear') {
        document.getElementById('header').textContent = '';
        document.getElementById('content').innerHTML =
          '<p class="empty">Move the cursor into an XML element to see its attributes.</p>';
      } else if (msg.type === 'loading') {
        document.getElementById('header').textContent = '';
        document.getElementById('content').innerHTML =
          '<p class="info-msg">' + esc(msg.message) + '</p>';
      } else if (msg.type === 'info') {
        document.getElementById('content').innerHTML =
          '<p class="info-msg">' + esc(msg.message) + '</p>';
      } else if (msg.type === 'error') {
        document.getElementById('content').innerHTML =
          '<p class="error-msg">Error: ' + esc(msg.message) + '</p>';
      } else if (msg.type === 'updateColors') {
        document.documentElement.style.setProperty('--xve-tag-color', msg.tagColor);
        document.documentElement.style.setProperty('--xve-attr-color', msg.attrColor);
        if (msg.attrValueColor) {
          document.documentElement.style.setProperty('--xve-attr-value-color', msg.attrValueColor);
        }
      } else if (msg.type === 'toggleTypeColumn') {
        var st = vscode.getState() || {};
        st.typeVisible = st.typeVisible === false ? true : false;
        vscode.setState(st);
        if (lastElementName && lastAttributes != null) {
          renderAttributes(lastElementName, lastAttributes, lastMinOccurs);
        }
      } else if (msg.type === 'toggleDocColumn') {
        var st = vscode.getState() || {};
        st.docVisible = st.docVisible === false ? true : false;
        vscode.setState(st);
        if (lastElementName && lastAttributes != null) {
          renderAttributes(lastElementName, lastAttributes, lastMinOccurs);
        }
      }
    });
  </script>
</body>
</html>`;
  }
}
