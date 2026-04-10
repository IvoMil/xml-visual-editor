import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { registerXmlCommands, XmlCommandDeps } from '../../commands/xml-commands';

describe('xml-commands - attribute panel toggle commands', () => {
  let commandHandlers: Map<string, (...args: unknown[]) => void>;
  let setContextCalls: Array<{ key: string; value: unknown }>;
  let mockAttrPanelMessages: Array<Record<string, unknown>>;
  let mockElemPanelMessages: Array<Record<string, unknown>>;

  // Save original mock functions to restore after each test
  let origRegisterCommand: any;
  let origExecuteCommand: any;

  function stubCommands(): void {
    const cmds = (vscode as any).commands;
    origRegisterCommand = cmds.registerCommand;
    origExecuteCommand = cmds.executeCommand;

    cmds.registerCommand = (id: string, handler: (...args: unknown[]) => void) => {
      commandHandlers.set(id, handler);
      return { dispose: () => {} };
    };
    cmds.executeCommand = (id: string, ...args: any[]) => {
      if (id === 'setContext') {
        setContextCalls.push({ key: args[0] as string, value: args[1] });
      }
    };
  }

  function restoreCommands(): void {
    const cmds = (vscode as any).commands;
    cmds.registerCommand = origRegisterCommand;
    cmds.executeCommand = origExecuteCommand;
  }

  function makeDeps(overrides?: Partial<XmlCommandDeps>): XmlCommandDeps {
    return {
      getEngine: () => undefined,
      getValidation: () => undefined,
      getSchema: () => undefined,
      getXmlActions: () => undefined,
      getCursorTracking: () => undefined,
      editorOps: {} as any,
      getElementsPanel: () =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        ({
          sendMessage: (msg: Record<string, unknown>) => {
            mockElemPanelMessages.push(msg);
          },
        }) as any,
      getAttributesPanel: () =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        ({
          sendMessage: (msg: Record<string, unknown>) => {
            mockAttrPanelMessages.push(msg);
          },
        }) as any,
      getAutoClose: () => undefined,
      ...overrides,
    };
  }

  beforeEach(() => {
    commandHandlers = new Map();
    setContextCalls = [];
    mockAttrPanelMessages = [];
    mockElemPanelMessages = [];

    stubCommands();

    const mockContext = { subscriptions: [] as any[] } as any;
    registerXmlCommands(mockContext, makeDeps());

    // Clear tracking from initialization
    setContextCalls = [];
    mockAttrPanelMessages = [];
    mockElemPanelMessages = [];
  });

  afterEach(() => {
    restoreCommands();
  });

  describe('toggleAttrDocColumn', () => {
    it('registers the command', () => {
      assert.ok(commandHandlers.has('xmlVisualEditor.toggleAttrDocColumn'));
    });

    it('sets attrDocColumnVisible context to false on first toggle', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrDocColumn')!();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrDocColumnVisible');
      assert.ok(ctx, 'setContext should be called for attrDocColumnVisible');
      assert.strictEqual(ctx.value, false);
    });

    it('sends toggleDocColumn message to attributes panel', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrDocColumn')!();
      assert.strictEqual(mockAttrPanelMessages.length, 1);
      assert.deepStrictEqual(mockAttrPanelMessages[0], { type: 'toggleDocColumn' });
    });

    it('does not send message to elements panel', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrDocColumn')!();
      assert.strictEqual(mockElemPanelMessages.length, 0);
    });

    it('toggles back to true on second invocation', () => {
      const handler = commandHandlers.get('xmlVisualEditor.toggleAttrDocColumn')!;
      handler();
      setContextCalls = [];
      handler();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrDocColumnVisible');
      assert.ok(ctx);
      assert.strictEqual(ctx.value, true);
    });
  });

  describe('toggleAttrDocColumnHidden', () => {
    it('registers the command', () => {
      assert.ok(commandHandlers.has('xmlVisualEditor.toggleAttrDocColumnHidden'));
    });

    it('sets attrDocColumnVisible context to false on first toggle', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrDocColumnHidden')!();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrDocColumnVisible');
      assert.ok(ctx);
      assert.strictEqual(ctx.value, false);
    });

    it('sends toggleDocColumn message to attributes panel', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrDocColumnHidden')!();
      assert.strictEqual(mockAttrPanelMessages.length, 1);
      assert.deepStrictEqual(mockAttrPanelMessages[0], { type: 'toggleDocColumn' });
    });
  });

  describe('toggleAttrTypeColumn', () => {
    it('registers the command', () => {
      assert.ok(commandHandlers.has('xmlVisualEditor.toggleAttrTypeColumn'));
    });

    it('sets attrTypeColumnVisible context to false on first toggle', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumn')!();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrTypeColumnVisible');
      assert.ok(ctx, 'setContext should be called for attrTypeColumnVisible');
      assert.strictEqual(ctx.value, false);
    });

    it('sends toggleTypeColumn message to attributes panel', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumn')!();
      assert.strictEqual(mockAttrPanelMessages.length, 1);
      assert.deepStrictEqual(mockAttrPanelMessages[0], { type: 'toggleTypeColumn' });
    });

    it('does not send message to elements panel', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumn')!();
      assert.strictEqual(mockElemPanelMessages.length, 0);
    });

    it('toggles back to true on second invocation', () => {
      const handler = commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumn')!;
      handler();
      setContextCalls = [];
      handler();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrTypeColumnVisible');
      assert.ok(ctx);
      assert.strictEqual(ctx.value, true);
    });
  });

  describe('toggleAttrTypeColumnHidden', () => {
    it('registers the command', () => {
      assert.ok(commandHandlers.has('xmlVisualEditor.toggleAttrTypeColumnHidden'));
    });

    it('sets attrTypeColumnVisible context to false on first toggle', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumnHidden')!();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrTypeColumnVisible');
      assert.ok(ctx);
      assert.strictEqual(ctx.value, false);
    });

    it('sends toggleTypeColumn message to attributes panel', () => {
      commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumnHidden')!();
      assert.strictEqual(mockAttrPanelMessages.length, 1);
      assert.deepStrictEqual(mockAttrPanelMessages[0], { type: 'toggleTypeColumn' });
    });
  });

  describe('shared state between toggle pairs', () => {
    it('toggleAttrDocColumn and toggleAttrDocColumnHidden share state', () => {
      // First toggle: true → false
      commandHandlers.get('xmlVisualEditor.toggleAttrDocColumn')!();
      setContextCalls = [];
      // Second toggle via Hidden variant: false → true (shared state)
      commandHandlers.get('xmlVisualEditor.toggleAttrDocColumnHidden')!();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrDocColumnVisible');
      assert.ok(ctx, 'Both commands should share the same toggle state');
      assert.strictEqual(ctx.value, true);
    });

    it('toggleAttrTypeColumn and toggleAttrTypeColumnHidden share state', () => {
      // First toggle: true → false
      commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumn')!();
      setContextCalls = [];
      // Second toggle via Hidden variant: false → true (shared state)
      commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumnHidden')!();
      const ctx = setContextCalls.find((c) => c.key === 'xmlvisualeditor.attrTypeColumnVisible');
      assert.ok(ctx, 'Both commands should share the same toggle state');
      assert.strictEqual(ctx.value, true);
    });
  });

  describe('initial context keys', () => {
    it('sets all attribute toggle context keys during registration', () => {
      // Re-register to capture initialization calls
      const initCalls: Array<{ key: string; value: unknown }> = [];
      const cmds = (vscode as any).commands;
      const prevExec = cmds.executeCommand;
      cmds.executeCommand = (id: string, ...args: any[]) => {
        if (id === 'setContext') {
          initCalls.push({ key: args[0] as string, value: args[1] });
        }
      };

      const mockContext = { subscriptions: [] as any[] } as any;
      registerXmlCommands(
        mockContext,
        makeDeps({
          getElementsPanel: () => undefined,
          getAttributesPanel: () => undefined,
        }),
      );

      cmds.executeCommand = prevExec;

      const attrDoc = initCalls.find((c) => c.key === 'xmlvisualeditor.attrDocColumnVisible');
      assert.ok(attrDoc, 'attrDocColumnVisible should be initialized');
      assert.strictEqual(attrDoc.value, true);

      const attrType = initCalls.find((c) => c.key === 'xmlvisualeditor.attrTypeColumnVisible');
      assert.ok(attrType, 'attrTypeColumnVisible should be initialized');
      assert.strictEqual(attrType.value, true);
    });
  });

  describe('null safety when panel is undefined', () => {
    it('toggleAttrDocColumn does not throw when getAttributesPanel returns undefined', () => {
      // Re-register with undefined panel
      commandHandlers = new Map();
      const mockContext = { subscriptions: [] as any[] } as any;
      registerXmlCommands(
        mockContext,
        makeDeps({
          getElementsPanel: () => undefined,
          getAttributesPanel: () => undefined,
        }),
      );

      // Should not throw even when attributes panel is undefined
      assert.doesNotThrow(() => {
        commandHandlers.get('xmlVisualEditor.toggleAttrDocColumn')!();
        commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumn')!();
        commandHandlers.get('xmlVisualEditor.toggleAttrDocColumnHidden')!();
        commandHandlers.get('xmlVisualEditor.toggleAttrTypeColumnHidden')!();
      });
    });
  });
});
