const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename);
const saved = [{ id: 'a', printerName: 'A', ipAddress: 'printer-a' }, { id: 'b', printerName: 'B', ipAddress: 'printer-b' }];
const originalLoad = Module._load;
Module._load = function(name, parent, main) {
  if (name === '@react-native-async-storage/async-storage') return { getItem: async () => JSON.stringify(saved), setItem: async () => {} };
  if (name === 'react-native') return { Alert: { alert() {} }, AppState: { addEventListener: () => ({ remove() {} }) } };
  return originalLoad.call(this, name, parent, main);
};
class Socket {
  static OPEN = 1; static instances = [];
  readyState = 0; sent = [];
  constructor(url) { this.url = url; Socket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  send(text) { this.sent.push(JSON.parse(text)); }
  reply(cmd, data, id) { this.onmessage?.({ data: JSON.stringify({ Data: { Cmd: cmd, Data: data, ...(id ? { RequestID: id } : {}) } }) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
global.WebSocket = Socket;
const { PrinterConnectionsProvider, usePrinterConnections } = require('../src/contexts/PrinterConnectionsContext.tsx');
Module._load = originalLoad;

test('connection correlates out-of-order replies, handles topic data, rejection and reconnect', async () => {
  let context; let root;
  function Probe() { context = usePrinterConnections(); return null; }
  await act(async () => { root = create(React.createElement(PrinterConnectionsProvider, null, React.createElement(Probe))); });
  const [a,b] = Socket.instances;
  await act(async () => { a.open(); b.open(); });
  await act(async () => {
    for (const socket of [a,b]) {
      socket.onmessage({ data: JSON.stringify({ Status: { PrintInfo: { Status: 0 }, TempOfNozzle: 25 }, MainboardID: socket.url }) });
      socket.onmessage({ data: JSON.stringify({ Attributes: { MachineName: 'Carbon' } }) });
    }
  });
  assert.equal(context.printers[0].status.TempOfNozzle, 25);
  assert.equal(context.printers[0].deviceAttributes.MachineName, 'Carbon');
  const files = context.requestFeature('a',258,{ Url: '/local' });
  const history = context.requestFeature('b',320);
  const fileId = a.sent.at(-1).Data.RequestID;
  const historyId = b.sent.at(-1).Data.RequestID;
  b.reply(320,{ Ack:0, HistoryData: ['task'] },historyId);
  a.reply(258,{ Ack:0, FileList: [{ name:'/local/test.gcode' }] },fileId);
  assert.equal((await history).HistoryData[0], 'task');
  assert.equal((await files).FileList[0].name,'/local/test.gcode');
  const rejected = context.requestFeature('a',128,{ Filename:'/local/missing.gcode' });
  a.reply(128,{ Ack:2 },a.sent.at(-1).Data.RequestID);
  await assert.rejects(rejected,/Datei nicht gefunden/);
  const interrupted = context.requestFeature('a',321,{ Id:['task'] });
  const check = assert.rejects(interrupted,/Verbindung wird neu/);
  await act(async () => { context.reconnectAll(); });
  await check;
  await assert.rejects(context.requestFeature('a',258), /offline/);
  await act(async () => { root.unmount(); });
});
