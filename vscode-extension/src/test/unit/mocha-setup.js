// Mocha setup: intercept 'vscode' module so unit tests can run outside VS Code
const Module = require('module');
const path = require('path');

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request === 'vscode') {
    return path.join(__dirname, 'vscode-mock.js');
  }
  return originalResolveFilename.call(this, request, parent, ...rest);
};
