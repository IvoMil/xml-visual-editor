import { strict as assert } from 'assert';
import { AttributesPanelProvider } from '../../panels/attributes-panel';

describe('AttributesPanelProvider', () => {
  function createProvider(): AttributesPanelProvider {
    return new AttributesPanelProvider(
      { isReady: () => false, sendRequest: () => ({}) } as any,
      async () => {},
    );
  }

  describe('sendMessage', () => {
    it('does not throw when no view is resolved', () => {
      const provider = createProvider();
      assert.doesNotThrow(() => {
        provider.sendMessage({ type: 'toggleDocColumn' });
      });
    });

    it('does not throw for toggleTypeColumn when no view is resolved', () => {
      const provider = createProvider();
      assert.doesNotThrow(() => {
        provider.sendMessage({ type: 'toggleTypeColumn' });
      });
    });

    it('posts message to webview when view is resolved', () => {
      const provider = createProvider();
      const postedMessages: any[] = [];
      (provider as any).view = {
        webview: {
          postMessage: (msg: any) => {
            postedMessages.push(msg);
            return Promise.resolve(true);
          },
        },
      };

      provider.sendMessage({ type: 'toggleDocColumn' });
      assert.strictEqual(postedMessages.length, 1);
      assert.deepStrictEqual(postedMessages[0], { type: 'toggleDocColumn' });
    });

    it('posts toggleTypeColumn message to webview when view is resolved', () => {
      const provider = createProvider();
      const postedMessages: any[] = [];
      (provider as any).view = {
        webview: {
          postMessage: (msg: any) => {
            postedMessages.push(msg);
            return Promise.resolve(true);
          },
        },
      };

      provider.sendMessage({ type: 'toggleTypeColumn' });
      assert.strictEqual(postedMessages.length, 1);
      assert.deepStrictEqual(postedMessages[0], { type: 'toggleTypeColumn' });
    });

    it('forwards arbitrary message types to webview', () => {
      const provider = createProvider();
      const postedMessages: any[] = [];
      (provider as any).view = {
        webview: {
          postMessage: (msg: any) => {
            postedMessages.push(msg);
            return Promise.resolve(true);
          },
        },
      };

      provider.sendMessage({ type: 'customMessage', data: 42 });
      assert.strictEqual(postedMessages.length, 1);
      assert.deepStrictEqual(postedMessages[0], { type: 'customMessage', data: 42 });
    });
  });
});
