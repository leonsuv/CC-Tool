const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const original = Module._load;
let directory;
let responseStatus = 200;
let contentType = 'video/mp4';
let moved = false;
const filesystem = {
  documentDirectory: 'file:///app/files/',
  makeDirectoryAsync: async uri => { directory = uri; },
  createDownloadResumable: (url, uri) => ({ cancelAsync: async () => {}, downloadAsync: async () => {
    const decoded = decodeURIComponent(uri);
    assert.equal(decoded.slice(0, decoded.lastIndexOf('/')), directory.replace(/\/$/, ''), 'Android must not decode the printer/task key into a subdirectory');
    return { uri, status: responseStatus, headers: { 'Content-Type': contentType } };
  } }),
  getInfoAsync: async () => ({ exists: true, size: 1024 }),
  moveAsync: async () => { moved = true; },
  deleteAsync: async () => {},
};
Module._load = function(name, parent, main) {
  if (name === 'expo-file-system') return filesystem;
  if (name === '@react-native-async-storage/async-storage') return {};
  return original.call(this, name, parent, main);
};
const { startVideoDownload } = require('../src/utils/downloads.ts');
Module._load = original;
test('Android download keeps printer/task IDs inside one filename and commits only valid video responses', async () => {
  const job = () => startVideoDownload('http://printer/video.mp4', '192.168.1.20:3030/task/with space', () => {});
  const result = await job().run(); assert.equal(result.bytes, 1024); assert.equal(moved, true);
  moved = false; responseStatus = 404;
  await assert.rejects(job().run(), /HTTP 404/); assert.equal(moved, false);
  responseStatus = 200; contentType = 'text/html';
  await assert.rejects(job().run(), /kein Video/); assert.equal(moved, false);
});
