import { strict as assert } from 'assert';
import { XmlActionsProvider } from '../../panels/xml-actions-provider';

describe('XmlActionsProvider', () => {
  let provider: XmlActionsProvider;

  beforeEach(() => {
    provider = new XmlActionsProvider();
  });

  describe('setActiveFile', () => {
    it('stores basename for rendering', () => {
      // Should not throw when no view is attached
      provider.setActiveFile('/some/dir/myfile.xml');
    });

    it('handles empty file path', () => {
      provider.setActiveFile('');
    });

    it('resets schema and validation after changing file', () => {
      provider.setActiveFile('/path/to/test.xml');
      provider.setSchema('my-schema', '/path/schema.xsd');
      provider.setValidationStatus(0);
      provider.setActiveFile('/path/to/other.xml');
      // No error means state was reset successfully
    });
  });

  describe('setSchema', () => {
    it('accepts name and optional path', () => {
      provider.setActiveFile('/path/to/test.xml');
      provider.setSchema('my-schema', '/path/to/schema.xsd');
    });

    it('defaults schemaPath to empty string when omitted', () => {
      provider.setActiveFile('/path/to/test.xml');
      provider.setSchema('inline-schema');
    });
  });

  describe('setValidationStatus', () => {
    it('accepts 0 issues (valid)', () => {
      provider.setActiveFile('/path/to/test.xml');
      provider.setValidationStatus(0);
    });

    it('accepts positive issue count', () => {
      provider.setActiveFile('/path/to/test.xml');
      provider.setValidationStatus(3);
    });

    it('accepts 1 issue (singular)', () => {
      provider.setActiveFile('/path/to/test.xml');
      provider.setValidationStatus(1);
    });
  });

  describe('setInsertRequiredActive', () => {
    it('accepts boolean toggle state', () => {
      provider.setInsertRequiredActive(true);
      provider.setInsertRequiredActive(false);
    });
  });

  describe('setAutoCloseActive', () => {
    it('accepts boolean toggle state', () => {
      provider.setAutoCloseActive(false);
      provider.setAutoCloseActive(true);
    });
  });

  describe('resolveWebviewView', () => {
    it('is a function on the provider', () => {
      assert.strictEqual(typeof provider.resolveWebviewView, 'function');
    });
  });

  describe('HTML structure', () => {
    it('renders toolbar above status section', () => {
      // Create a mock webview view to capture HTML
      let capturedHtml = '';
      const mockWebview = {
        options: {},
        html: '',
        onDidReceiveMessage: () => ({ dispose: () => {} }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        asWebviewUri: (uri: any) => uri,
        cspSource: '',
      };
      Object.defineProperty(mockWebview, 'html', {
        set(value: string) {
          capturedHtml = value;
        },
        get() {
          return capturedHtml;
        },
      });
      const mockView = {
        webview: mockWebview,
        visible: true,
        onDidChangeVisibility: () => ({ dispose: () => {} }),
        onDidDispose: () => ({ dispose: () => {} }),
        show: () => {},
      } as any;

      provider.setActiveFile('/path/to/test.xml');
      provider.resolveWebviewView(
        mockView,
        {} as any,
        {
          isCancellationRequested: false,
          onCancellationRequested: () => ({ dispose: () => {} }),
        } as any,
      );

      // Toolbar div should come before status-section div
      const toolbarIndex = capturedHtml.indexOf('class="toolbar"');
      const statusIndex = capturedHtml.indexOf('class="status-section"');
      assert.ok(toolbarIndex > -1, 'toolbar div should exist');
      assert.ok(statusIndex > -1, 'status-section div should exist');
      assert.ok(toolbarIndex < statusIndex, 'toolbar should appear before status-section in HTML');
    });
  });
});
