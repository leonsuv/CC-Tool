const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { latestValueSender } = require('../src/utils/latestValueSender.ts');

test('fan updates coalesce, respect 1 second even on release, and retain the final value', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const calls = [];
  const queue = latestValueSender(async value => { calls.push([Date.now(), value]); });
  for (let i = 0; i <= 30; i++) queue.change(i);
  t.mock.timers.tick(999); assert.equal(calls.length, 0);
  t.mock.timers.tick(1); await Promise.resolve();
  assert.deepEqual(calls, [[11000, 30]]);
  queue.change(45, true); queue.change(70, true);
  t.mock.timers.tick(999); assert.equal(calls.length, 1);
  t.mock.timers.tick(1); await Promise.resolve();
  assert.deepEqual(calls, [[11000, 30], [12000, 70]]);
  queue.change(70, true); t.mock.timers.tick(1000);
  assert.equal(calls.length, 2);
  queue.change(90); queue.dispose(); t.mock.timers.tick(2000);
  assert.equal(calls.length, 2);
});

test('slow fan requests never overlap and only the newest pending value is sent', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 10000 });
  const calls = []; let resolve;
  const queue = latestValueSender(value => { calls.push(value); return new Promise(r => { resolve = r; }); });
  queue.change(10, true); queue.change(20); queue.change(80, true);
  t.mock.timers.tick(3000); assert.deepEqual(calls, [10]);
  resolve(); await Promise.resolve(); t.mock.timers.tick(1);
  assert.deepEqual(calls, [10, 80]);
  queue.dispose(); resolve(); await Promise.resolve();
});
