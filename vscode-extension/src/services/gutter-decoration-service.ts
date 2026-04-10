import * as vscode from 'vscode';
import * as path from 'path';

export class GutterDecorationService implements vscode.Disposable {
  private readonly errorDecorationType: vscode.TextEditorDecorationType;
  private readonly warningDecorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(extensionPath: string) {
    this.errorDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: path.join(extensionPath, 'resources', 'icons', 'error-gutter.svg'),
      gutterIconSize: '80%',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.errorForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.warningDecorationType = vscode.window.createTextEditorDecorationType({
      gutterIconPath: path.join(extensionPath, 'resources', 'icons', 'warning-gutter.svg'),
      gutterIconSize: '80%',
      overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.warningForeground'),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
    this.disposables.push(this.errorDecorationType, this.warningDecorationType);
  }

  updateDecorations(editor: vscode.TextEditor): void {
    const cfg = vscode.workspace.getConfiguration('xmlVisualEditor', editor.document.uri);
    if (!cfg.get<boolean>('validation.showGutterWarnings', true)) {
      editor.setDecorations(this.errorDecorationType, []);
      editor.setDecorations(this.warningDecorationType, []);
      return;
    }

    const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);
    const xveDiagnostics = diagnostics.filter((d) => d.source === 'XML Visual Editor');

    const errorRanges: vscode.DecorationOptions[] = [];
    const warningRanges: vscode.DecorationOptions[] = [];
    const errorLines = new Set<number>();
    const warningLines = new Set<number>();

    for (const d of xveDiagnostics) {
      const line = d.range.start.line;
      if (d.severity === vscode.DiagnosticSeverity.Error && !errorLines.has(line)) {
        errorLines.add(line);
        errorRanges.push({
          range: new vscode.Range(line, 0, line, 0),
          hoverMessage: new vscode.MarkdownString(`**Error:** ${d.message}`),
        });
      } else if (d.severity === vscode.DiagnosticSeverity.Warning && !warningLines.has(line)) {
        warningLines.add(line);
        warningRanges.push({
          range: new vscode.Range(line, 0, line, 0),
          hoverMessage: new vscode.MarkdownString(`**Warning:** ${d.message}`),
        });
      }
    }

    editor.setDecorations(this.errorDecorationType, errorRanges);
    editor.setDecorations(this.warningDecorationType, warningRanges);
  }

  clearDecorations(editor: vscode.TextEditor): void {
    editor.setDecorations(this.errorDecorationType, []);
    editor.setDecorations(this.warningDecorationType, []);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
