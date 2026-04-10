import * as vscode from 'vscode';
import * as path from 'path';

interface ActionButton {
  command: string;
  icon: string;
  title: string;
  active?: boolean;
}

export class XmlActionsProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private activeFileName = '';
  private schemaName = '';
  private schemaPath = '';
  private validationIssueCount = -1;
  private insertRequiredActive = true;
  private autoCloseActive = true;

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    this.render();

    webviewView.webview.onDidReceiveMessage((message: { command: string }) => {
      void vscode.commands.executeCommand(message.command);
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.render();
    });
  }

  setActiveFile(filePath: string): void {
    this.activeFileName = filePath ? path.basename(filePath) : '';
    this.schemaName = '';
    this.schemaPath = '';
    this.validationIssueCount = -1;
    this.render();
  }

  setSchema(name: string, schemaPath?: string): void {
    this.schemaName = name;
    this.schemaPath = schemaPath ?? '';
    this.render();
  }

  setValidationStatus(issueCount: number): void {
    this.validationIssueCount = issueCount;
    this.render();
  }

  setInsertRequiredActive(active: boolean): void {
    this.insertRequiredActive = active;
    this.render();
  }

  setAutoCloseActive(active: boolean): void {
    this.autoCloseActive = active;
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    this.view.webview.html = this.getHtml();
  }

  private getButtons(): ActionButton[] {
    const irCmd = this.insertRequiredActive
      ? 'xmlVisualEditor.toggleInsertRequiredActive'
      : 'xmlVisualEditor.toggleInsertRequired';
    const acCmd = this.autoCloseActive
      ? 'xmlVisualEditor.toggleAutoCloseActive'
      : 'xmlVisualEditor.toggleAutoClose';
    return [
      {
        command: 'xmlVisualEditor.checkWellFormedness',
        icon: '\u2713',
        title: 'Check Well-Formedness',
      },
      {
        command: 'xmlVisualEditor.validateDocument',
        icon: '\u2611',
        title: 'Validate with Schema',
      },
      { command: 'xmlVisualEditor.loadSchema', icon: '\u2295', title: 'Load Schema' },
      {
        command: irCmd,
        icon: this.insertRequiredActive ? '\u2605' : '\u2606',
        title: 'Toggle Insert Required',
        active: this.insertRequiredActive,
      },
      { command: 'xmlVisualEditor.prettyPrint', icon: '\u2261', title: 'Pretty Print' },
      { command: 'xmlVisualEditor.linearize', icon: '\u2015', title: 'Linearize' },
      { command: 'xmlVisualEditor.stripWhitespace', icon: '\u2422', title: 'Strip Whitespace' },
      {
        command: acCmd,
        icon: this.autoCloseActive ? '\u27E8/\u27E9' : '\u27E8\u27E9',
        title: 'Toggle Auto-Close Tags',
        active: this.autoCloseActive,
      },
      { command: 'xmlVisualEditor.copyXmlPath', icon: '/', title: 'Copy XML Path' },
      {
        command: 'xmlVisualEditor.copyXmlPathWithPredicates',
        icon: '/[]',
        title: 'Copy XML Path with Predicates',
      },
      { command: 'xmlVisualEditor.openSettings', icon: '\u2699', title: 'Settings' },
    ];
  }

  private getHtml(): string {
    const fileDisplay = this.activeFileName || 'No file open';
    const schemaDisplay = this.schemaName || 'No schema loaded';

    let validationText = 'Not validated';
    let validationClass = 'neutral';
    let validationIcon = '\u25CB'; // ○
    if (this.validationIssueCount === -2) {
      validationIcon = '\u26A0'; // ⚠
      validationText = 'Schema unavailable';
      validationClass = 'invalid';
    } else if (this.validationIssueCount === 0) {
      validationIcon = '\u2714'; // ✔
      validationText = 'Valid';
      validationClass = 'valid';
    } else if (this.validationIssueCount > 0) {
      validationIcon = '\u26A0'; // ⚠
      validationText = `${this.validationIssueCount} issue${this.validationIssueCount !== 1 ? 's' : ''}`;
      validationClass = 'invalid';
    }

    const btns = this.getButtons();
    const groups = [
      btns.slice(0, 3),
      [btns[3]],
      btns.slice(4, 7),
      [btns[7]],
      btns.slice(8, 10),
      [btns[10]],
    ];
    const toolbarHtml = groups
      .map((g) => `<span class="toolbar-group">${g.map((b) => this.buttonHtml(b)).join('')}</span>`)
      .join('<span class="toolbar-sep"></span>');

    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size);color:var(--vscode-foreground);padding:4px 8px;margin:0;}
.status-section{margin-top:4px;padding-top:4px;border-top:1px solid var(--vscode-panel-border);}
.status-row{display:flex;align-items:center;gap:6px;padding:1px 0;font-size:12px;line-height:18px;}
.status-icon{width:16px;text-align:center;flex-shrink:0;}
.status-value{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.valid{color:var(--vscode-testing-iconPassed);}
.invalid{color:var(--vscode-problemsWarningIcon-foreground);}
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px 0;}
.toolbar-group{display:flex;gap:1px;}
.toolbar-sep{width:1px;background:var(--vscode-panel-border);margin:2px 3px;align-self:stretch;min-height:22px;}
.toolbar button{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;background:transparent;border:1px solid transparent;border-radius:4px;cursor:pointer;color:var(--vscode-foreground);padding:0 4px;font-size:14px;line-height:1;}
.toolbar button:hover{background:var(--vscode-toolbar-hoverBackground);border-color:var(--vscode-toolbar-hoverOutline,transparent);}
.toolbar button.active{color:var(--vscode-inputOption-activeForeground);background:var(--vscode-inputOption-activeBackground);border-color:var(--vscode-inputOption-activeBorder,transparent);}
</style></head><body>
<div class="toolbar">${toolbarHtml}</div>
<div class="status-section">
<div class="status-row"><span class="status-icon">\uD83D\uDCC4</span><span class="status-value">${esc(fileDisplay)}</span></div>
<div class="status-row"><span class="status-icon">\uD83D\uDCD6</span><span class="status-value" title="${esc(this.schemaPath)}">${esc(schemaDisplay)}</span></div>
<div class="status-row"><span class="status-icon">${validationIcon}</span><span class="status-value ${validationClass}">${esc(validationText)}</span></div>
</div>
<script>
const vscode=acquireVsCodeApi();
document.querySelectorAll('.toolbar button').forEach(b=>{
  b.addEventListener('click',()=>{const c=b.getAttribute('data-command');if(c)vscode.postMessage({command:c});});
});
function esc(t){return t;}
</script></body></html>`;
  }

  private buttonHtml(btn: ActionButton): string {
    const cls = btn.active ? ' active' : '';
    return `<button data-command="${esc(btn.command)}" title="${esc(btn.title)}" class="${cls}"><span>${esc(btn.icon)}</span></button>`;
  }
}

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
