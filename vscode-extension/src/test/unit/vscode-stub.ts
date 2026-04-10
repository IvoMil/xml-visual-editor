/**
 * Minimal stub for the 'vscode' module — provides just enough surface
 * so that elements-panel.ts can be imported in unit tests.
 */
export class EventEmitter<T> {
  private listeners: Array<(e: T) => void> = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data: T) {
    this.listeners.forEach((l) => l(data));
  }
  dispose() {
    this.listeners = [];
  }
}

export class Range {
  constructor(
    public start: any,
    public end: any,
  ) {}
}

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class TreeItem {
  label?: string;
  description?: string;
  iconPath?: any;
  collapsibleState?: number;
  constructor(label: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export class ThemeColor {
  constructor(public id: string) {}
}

export class MarkdownString {
  constructor(public value?: string) {}
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export enum OverviewRulerLane {
  Left = 1,
  Center = 2,
  Right = 4,
  Full = 7,
}

export const CodeActionKind = {
  QuickFix: { value: 'quickfix' },
};

export class CodeAction {
  title: string;
  kind: any;
  diagnostics: any[] = [];
  edit?: any;
  constructor(title: string, kind?: any) {
    this.title = title;
    this.kind = kind;
  }
}

export class WorkspaceEdit {
  private _edits: any[] = [];
  insert(uri: any, position: any, text: string): void {
    this._edits.push({ type: 'insert', uri, position, text });
  }
  replace(uri: any, range: any, text: string): void {
    this._edits.push({ type: 'replace', uri, range, text });
  }
}

export const window = {
  activeTextEditor: undefined as any,
  createTextEditorDecorationType: () => ({ dispose: () => {} }),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: 'file' }),
};

export const workspace = {
  getConfiguration: () => ({ get: () => undefined }),
};

export const languages = {
  getDiagnostics: (): unknown[] => [],
  createDiagnosticCollection: () => ({
    set: () => {},
    delete: () => {},
    dispose: () => {},
  }),
};
