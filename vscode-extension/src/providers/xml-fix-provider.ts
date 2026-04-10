import * as vscode from 'vscode';

export class XmlFixProvider implements vscode.CodeActionProvider {
  static readonly metadata: vscode.CodeActionProviderMetadata = {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
  };

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    _token: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    const cfg = vscode.workspace.getConfiguration('xmlVisualEditor', document.uri);
    if (!cfg.get<boolean>('validation.showFixSuggestions', false)) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      if (diagnostic.source !== 'XML Visual Editor') continue;

      this.addMissingElementFix(document, diagnostic, actions);
      this.addTypoFix(document, diagnostic, actions);
    }

    return actions;
  }

  private addMissingElementFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    actions: vscode.CodeAction[],
  ): void {
    const missingMatch = diagnostic.message.match(
      /[Mm]issing required (?:child )?element[:\s]+['"]?(\w[\w:.-]*)['"]?/,
    );
    if (!missingMatch) return;

    const elementName = missingMatch[1];
    const action = new vscode.CodeAction(
      `Insert missing required element '<${elementName}>'`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    const insertPos = document.lineAt(diagnostic.range.start.line).range.end;
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, insertPos, `\n<${elementName}></${elementName}>`);
    actions.push(action);
  }

  private addTypoFix(
    document: vscode.TextDocument,
    diagnostic: vscode.Diagnostic,
    actions: vscode.CodeAction[],
  ): void {
    const unexpectedMatch =
      diagnostic.message.match(
        /(?:[Uu]nexpected|[Ii]nvalid|[Nn]ot expected|[Nn]ot allowed).*?element[:\s]+['"]?(\w[\w:.-]*)['"]?/,
      ) ||
      diagnostic.message.match(
        /[Ee]lement\s+['"]?(\w[\w:.-]*)['"]?\s+(?:is not|not)\s+(?:expected|allowed|valid)/,
      );
    if (!unexpectedMatch) return;

    const wrongName = unexpectedMatch[1];
    if (wrongName.length < 3) return;

    const text = document.getText();
    const tagNames = new Set<string>();
    const tagRegex = /<(\w[\w:.-]*)[>\s/]/g;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(text)) !== null) {
      if (tagMatch[1] !== wrongName) {
        tagNames.add(tagMatch[1]);
      }
    }

    let bestCandidate: string | undefined;
    let bestDist = 3;
    for (const candidate of tagNames) {
      const dist = levenshteinDistance(wrongName.toLowerCase(), candidate.toLowerCase());
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) return;

    const action = new vscode.CodeAction(
      `Did you mean '<${bestCandidate}>'?`,
      vscode.CodeActionKind.QuickFix,
    );
    action.diagnostics = [diagnostic];
    action.edit = new vscode.WorkspaceEdit();

    const lineText = document.lineAt(diagnostic.range.start.line).text;
    const escaped = wrongName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const openTagMatch = lineText.match(new RegExp(`<${escaped}([\\s>])`));
    if (openTagMatch) {
      const startCol = lineText.indexOf(openTagMatch[0]);
      action.edit.replace(
        document.uri,
        new vscode.Range(
          diagnostic.range.start.line,
          startCol + 1,
          diagnostic.range.start.line,
          startCol + 1 + wrongName.length,
        ),
        bestCandidate,
      );
    }
    actions.push(action);
  }
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
