import * as assert from 'assert';
import { EventEmitter } from 'events';
import { EngineClient } from '../../engine/engine-client';

suite('EngineClient', () => {
  test('isReady() returns false before start', () => {
    const client = new EngineClient({} as any);
    assert.strictEqual(client.isReady(), false);
  });

  test('sends JSON-RPC request and resolves on response', async () => {
    const client = new EngineClient({ extensionPath: '/tmp' } as any);

    // Create a mock child process using EventEmitter
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();

    const writes: string[] = [];
    mockProcess.stdin = {
      write: (data: string, _enc: string, cb?: () => void) => {
        writes.push(data.toString());
        if (cb) cb();
      },
      end: () => {},
    };

    // Inject mock process and mark ready
    (client as any).process = mockProcess;
    (client as any).ready = true;
    (client as any).setupProcessHandlers();

    const p = client.sendRequest('test.method', { foo: 'bar' });

    // Verify write format
    assert.strictEqual(writes.length, 1);
    const sent = JSON.parse(writes[0]);
    assert.strictEqual(sent.jsonrpc, '2.0');
    assert.strictEqual(sent.method, 'test.method');
    assert.strictEqual(typeof sent.id, 'number');

    // Simulate engine response
    const resp = { jsonrpc: '2.0', id: sent.id, result: { ok: true } };
    mockProcess.stdout.emit('data', JSON.stringify(resp) + '\n');

    const result = await p;
    assert.deepStrictEqual(result, { ok: true });
  });

  test('rejects promise on engine error response', async () => {
    const client = new EngineClient({ extensionPath: '/tmp' } as any);
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    const writes: string[] = [];
    mockProcess.stdin = {
      write: (data: string, _enc: string, cb?: () => void) => {
        writes.push(data.toString());
        if (cb) cb();
      },
      end: () => {},
    };

    (client as any).process = mockProcess;
    (client as any).ready = true;
    (client as any).setupProcessHandlers();

    const p = client.sendRequest('test.err', {});
    const sent = JSON.parse(writes[0]);

    const resp = { jsonrpc: '2.0', id: sent.id, error: { code: 123, message: 'boom' } };
    mockProcess.stdout.emit('data', JSON.stringify(resp) + '\n');

    await assert.rejects(p, /Engine error \[123\]: boom/);
  });

  test('handles partial lines and correlates concurrent requests', async () => {
    const client = new EngineClient({ extensionPath: '/tmp' } as any);
    const mockProcess = new EventEmitter() as any;
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    const writes: string[] = [];
    mockProcess.stdin = {
      write: (data: string, _enc: string, cb?: () => void) => {
        writes.push(data.toString());
        if (cb) cb();
      },
      end: () => {},
    };

    (client as any).process = mockProcess;
    (client as any).ready = true;
    (client as any).setupProcessHandlers();

    const p1 = client.sendRequest('a', {});
    const p2 = client.sendRequest('b', {});

    const sent1 = JSON.parse(writes[0]);
    const sent2 = JSON.parse(writes[1]);

    // Respond out-of-order and in partial chunks
    const resp2 = JSON.stringify({ jsonrpc: '2.0', id: sent2.id, result: { b: 2 } }) + '\n';
    const resp1 = JSON.stringify({ jsonrpc: '2.0', id: sent1.id, result: { a: 1 } }) + '\n';

    // emit part of resp2, then remainder + resp1
    const part = resp2.slice(0, Math.floor(resp2.length / 2));
    const rest = resp2.slice(Math.floor(resp2.length / 2));

    mockProcess.stdout.emit('data', part);
    mockProcess.stdout.emit('data', rest + resp1);

    const r2 = await p2;
    const r1 = await p1;

    assert.deepStrictEqual(r1, { a: 1 });
    assert.deepStrictEqual(r2, { b: 2 });
  });
});
