/**
 * Minimal vscode module mock for unit tests that import modules
 * depending on 'vscode'. Must be loaded before any test files.
 *
 * This is deliberately a plain JS bootstrap (compiled output is used).
 * The actual hook is in vscode-mock-setup-hook.js which is a raw JS file.
 */
// This file is intentionally minimal — the real work is in the .js hook file.
export {};
