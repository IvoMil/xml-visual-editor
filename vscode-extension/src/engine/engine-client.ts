import * as vscode from 'vscode';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import { JsonRpcRequest, JsonRpcResponse } from './types';

const MAX_RESTART_ATTEMPTS = 3;
const READY_SIGNAL = 'Engine server ready';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  method: string;
}

export class EngineClient implements vscode.Disposable {
  private process: ChildProcess | null = null;
  private nextId = 1;
  private pendingRequests = new Map<number, PendingRequest>();
  private outputChannel: vscode.LogOutputChannel;
  private ready = false;
  private restartCount = 0;
  private disposed = false;
  private lineBuffer = '';

  private readonly onReadyEmitter = new vscode.EventEmitter<void>();
  private readonly onErrorEmitter = new vscode.EventEmitter<Error>();
  private readonly onExitEmitter = new vscode.EventEmitter<number | null>();

  readonly onReady: vscode.Event<void> = this.onReadyEmitter.event;
  readonly onError: vscode.Event<Error> = this.onErrorEmitter.event;
  readonly onExit: vscode.Event<number | null> = this.onExitEmitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('XVE Engine', { log: true });
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    const enginePath = this.resolveEnginePath();
    this.outputChannel.info(`Starting engine: ${enginePath}`);

    this.process = spawn(enginePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    this.setupProcessHandlers();
    await this.waitForReady();
  }

  async stop(): Promise<void> {
    this.disposed = true;
    if (!this.process) {
      return;
    }

    this.rejectAllPending('Engine shutting down');

    if (this.process.stdin) {
      this.process.stdin.end();
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.process?.kill('SIGKILL');
        resolve();
      }, 3000);

      this.process?.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    this.process = null;
    this.ready = false;
  }

  async sendRequest(method: string, params?: unknown, timeout = 10000): Promise<unknown> {
    if (!this.process?.stdin || !this.ready) {
      throw new Error('Engine is not ready');
    }

    const id = this.nextId++;
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise<unknown>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;

      if (timeout > 0) {
        timer = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`Request '${method}' timed out after ${timeout}ms`));
        }, timeout);
      }

      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          if (timer) clearTimeout(timer);
          resolve(value);
        },
        reject: (err: Error) => {
          if (timer) clearTimeout(timer);
          reject(err);
        },
        method,
      });

      const json = JSON.stringify(request) + '\n';
      this.process?.stdin?.write(json, 'utf-8', (err) => {
        if (err) {
          if (timer) clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(new Error(`Failed to write to engine stdin: ${err.message}`));
        }
      });
    });
  }

  isReady(): boolean {
    return this.ready;
  }

  dispose(): void {
    void this.stop();
    this.onReadyEmitter.dispose();
    this.onErrorEmitter.dispose();
    this.onExitEmitter.dispose();
    this.outputChannel.dispose();
  }

  private resolveEnginePath(): string {
    const config = vscode.workspace.getConfiguration('xmlVisualEditor');
    const configuredPath = config.get<string>('enginePath', '');

    if (configuredPath) {
      return configuredPath;
    }

    // Default: look for engine binary relative to extension root
    // In development, the extension lives under <workspace>/vscode-extension/,
    // so the engine binary is at <workspace>/build/debug/core/Debug/xve-engine.exe
    const ext = process.platform === 'win32' ? '.exe' : '';
    const extensionUri = this.context.extensionUri;
    const workspaceUri = vscode.Uri.joinPath(extensionUri, '..');
    const devBuildUri = vscode.Uri.joinPath(
      workspaceUri,
      'build',
      'debug',
      'core',
      'Debug',
      `xve-engine${ext}`,
    );

    if (fs.existsSync(devBuildUri.fsPath)) {
      return devBuildUri.fsPath;
    }

    // Fallback: bundled binary next to extension
    return vscode.Uri.joinPath(extensionUri, 'bin', `xve-engine${ext}`).fsPath;
  }

  private setupProcessHandlers(): void {
    if (!this.process) {
      return;
    }

    // Handle stdout: line-delimited JSON-RPC responses
    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.handleStdoutData(chunk.toString('utf-8'));
    });

    // Handle stderr: log output and detect ready signal
    this.process.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      this.outputChannel.trace(text.trimEnd());
    });

    this.process.on('error', (err: Error) => {
      this.outputChannel.error(`Engine process error: ${err.message}`);
      this.onErrorEmitter.fire(err);
    });

    this.process.on('exit', (code: number | null) => {
      this.outputChannel.info(`Engine exited with code ${String(code)}`);
      this.ready = false;
      this.process = null;
      this.rejectAllPending(`Engine exited with code ${String(code)}`);
      this.onExitEmitter.fire(code);

      if (!this.disposed && code !== 0) {
        void this.attemptRestart();
      }
    });
  }

  private handleStdoutData(data: string): void {
    this.lineBuffer += data;
    const lines = this.lineBuffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      this.handleResponseLine(trimmed);
    }
  }

  private handleResponseLine(line: string): void {
    let response: JsonRpcResponse;
    try {
      response = JSON.parse(line) as JsonRpcResponse;
    } catch {
      this.outputChannel.warn(`Failed to parse engine response: ${line}`);
      return;
    }

    if (response.id == null) {
      // Notification (no id) — log and ignore for now
      this.outputChannel.debug(`Engine notification: ${line}`);
      return;
    }

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.outputChannel.debug(`No pending request for id ${String(response.id)}`);
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(`Engine error [${response.error.code}]: ${response.error.message}`));
    } else {
      pending.resolve(response.result);
    }
  }

  private waitForReady(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Engine failed to become ready within 10 seconds'));
      }, 10000);

      const onStderr = (chunk: Buffer): void => {
        const text = chunk.toString('utf-8');
        if (text.includes(READY_SIGNAL)) {
          clearTimeout(timeout);
          this.process?.stderr?.removeListener('data', onStderr);
          this.ready = true;
          this.restartCount = 0;
          this.onReadyEmitter.fire();
          resolve();
        }
      };

      this.process?.stderr?.on('data', onStderr);

      this.process?.once('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Engine exited during startup with code ${String(code)}`));
      });
    });
  }

  private async attemptRestart(): Promise<void> {
    if (this.restartCount >= MAX_RESTART_ATTEMPTS) {
      this.outputChannel.error(`Engine failed ${MAX_RESTART_ATTEMPTS} times, not restarting`);
      this.onErrorEmitter.fire(new Error('Engine exceeded maximum restart attempts'));
      return;
    }

    this.restartCount++;
    this.outputChannel.info(
      `Restarting engine (attempt ${this.restartCount}/${MAX_RESTART_ATTEMPTS})...`,
    );

    try {
      await this.start();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.outputChannel.error(`Restart failed: ${message}`);
    }
  }

  private rejectAllPending(reason: string): void {
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error(reason));
      this.pendingRequests.delete(id);
    }
  }
}
