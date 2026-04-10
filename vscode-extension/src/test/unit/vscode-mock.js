// Minimal vscode mock for unit tests that import modules with vscode dependencies
// but only test pure functions that don't use vscode APIs.
module.exports = {
  EventEmitter: class {
    constructor() {
      this._listeners = [];
      this.event = (listener) => {
        this._listeners.push(listener);
        return { dispose: () => {} };
      };
    }
    fire(data) { this._listeners.forEach((l) => l(data)); }
    dispose() { this._listeners = []; }
  },
  Range: class {
    constructor(startLine, startChar, endLine, endChar) {
      this.start = { line: startLine, character: startChar };
      this.end = { line: endLine, character: endChar };
    }
  },
  Position: class {
    constructor(line, character) {
      this.line = line;
      this.character = character;
    }
  },
  Selection: class {
    constructor(anchorLine, anchorChar, activeLine, activeChar) {
      if (typeof anchorLine === 'object') {
        // Selection(Position, Position) overload
        this.anchor = anchorLine;
        this.active = anchorChar;
        this.start = anchorLine;
        this.end = anchorChar;
      } else {
        this.anchor = { line: anchorLine, character: anchorChar };
        this.active = { line: activeLine, character: activeChar };
        this.start = this.anchor;
        this.end = this.active;
      }
    }
  },
  TextEditorRevealType: { AtTop: 0, InCenter: 1, InCenterIfOutsideViewport: 2, Default: 3 },
  TreeItem: class {
    constructor(label, collapsibleState) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ThemeIcon: class {
    constructor(id) { this.id = id; }
  },
  ThemeColor: class {
    constructor(id) { this.id = id; }
  },
  MarkdownString: class {
    constructor(value) { this.value = value; }
  },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  Diagnostic: class {
    constructor(range, message, severity) {
      this.range = range;
      this.message = message;
      this.severity = severity;
    }
  },
  OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
  CodeActionKind: { QuickFix: { value: 'quickfix' } },
  CodeAction: class {
    constructor(title, kind) {
      this.title = title;
      this.kind = kind;
      this.diagnostics = [];
    }
  },
  WorkspaceEdit: class {
    constructor() { this._edits = []; }
    insert(uri, position, text) { this._edits.push({ type: 'insert', uri, position, text }); }
    replace(uri, range, text) { this._edits.push({ type: 'replace', uri, range, text }); }
  },
  commands: {
    registerCommand: (id, handler) => ({ dispose: () => {} }),
    executeCommand: () => Promise.resolve(),
  },
  window: {
    activeTextEditor: undefined,
    createTextEditorDecorationType: () => ({ dispose: () => {} }),
    createOutputChannel: () => ({ appendLine: () => {}, dispose: () => {}, info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, trace: () => {} }),
    setStatusBarMessage: () => ({ dispose: () => {} }),
    showWarningMessage: () => Promise.resolve(undefined),
    showInformationMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    showInputBox: () => Promise.resolve(undefined),
    showOpenDialog: () => Promise.resolve(undefined),
  },
  workspace: {
    getConfiguration: () => ({ get: () => undefined, update: () => Promise.resolve() }),
    applyEdit: () => Promise.resolve(true),
  },
  env: {
    clipboard: { writeText: () => Promise.resolve(), readText: () => Promise.resolve('') },
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  TextEdit: {
    replace: (range, text) => ({ range, newText: text }),
  },
  Uri: {
    file: (f) => ({ fsPath: f, toString: () => f }),
  },
  languages: {
    getDiagnostics: () => [],
    createDiagnosticCollection: () => ({
      set: () => {},
      get: () => [],
      delete: () => {},
      dispose: () => {},
    }),
    registerDocumentFormattingEditProvider: () => ({ dispose: () => {} }),
  },
};
