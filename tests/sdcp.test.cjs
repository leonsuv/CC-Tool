const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { parseFiles, parseHistory, mediaUrl, printPayload } = require('../src/utils/sdcp.ts');
const { isResumable, isStoppable, getPrintStatus } = require('../src/types/index.ts');
const { gcodeThumbnail } = require('../src/utils/thumbnail.ts');
const { cameraDocument } = require('../src/utils/camera.ts');
test('camera document fits the viewport without scrolling and escapes its URL', () => {
  const html = cameraDocument('http://printer/video?a=1&b="test"');
  assert.match(html, /object-fit:contain/);
  assert.match(html, /overflow:hidden/);
  assert.match(html, /&amp;b=&quot;test&quot;/);
});

test('G-code preview fallback accepts complete images and ignores truncated blocks', () => {
  assert.equal(gcodeThumbnail('; thumbnail begin 144x144 12\n; iVBORabc\n; def=\n; thumbnail end'), 'data:image/png;base64,iVBORabcdef=');
  assert.equal(gcodeThumbnail('; thumbnail begin 144x144 12\n; iVBORabc'), undefined);
  assert.equal(gcodeThumbnail('; thumbnail begin 144x144 12\n; invalid!\n; thumbnail end'), undefined);
});

test('Centauri lowercase filenames, file sizes and folders survive normalization', () => {
  const files = parseFiles({ FileList: [{ name: '/local/Übertopf groß.gcode', FileSize: 123456, TotalLayers: 82, type: 1 }, { name: '/local/models', type: 0 }, { Name: 'other.gcode', Size: 2048 }, '/local/string.gcode'] }, '/local');
  assert.equal(files[0].name, 'Übertopf groß.gcode'); assert.equal(files[0].size, 123456); assert.equal(files[0].layers, 82);
  assert.equal(files[1].directory, true); assert.equal(files[2].path, '/local/other.gcode'); assert.equal(files[3].name, 'string.gcode');
  assert.equal(parseFiles({ FileList: [{ Name: 'nested.gcode' }] }, '/udisk/models')[0].path, '/udisk/models/nested.gcode');
  assert.deepEqual(parseFiles({ FileList: [] }, '/local'), []);
  assert.throws(() => parseFiles({ Ack: 0 }, '/local'), /Dateiliste/);
});
test('history uses TaskStatus, BeginTime, nested slice data and per-job video status', () => {
  const history = parseHistory({ HistoryDetailList: [{ TaskId: 'one', TaskName: '/local/Big model.gcode', BeginTime: 1700000000, EndTime: 1700003660, TaskStatus: 1, AlreadyPrintLayer: 250, SliceInformation: { total_layer_numbers: 250, filament_type: 'PLA' }, TimeLapseVideoStatus: 1, TimeLapseVideoUrl: '/video/one.mp4' }, { TaskId: 'two', TaskName: 'Cancelled.gcode', BeginTime: 1700009000, TaskStatus: 3, TimeLapseVideoStatus: 3 }] });
  assert.equal(history[0].status, 'Abgebrochen'); assert.equal(history[1].status, 'Abgeschlossen'); assert.equal(history[1].name, 'Big model.gcode'); assert.equal(history[1].duration, 3660); assert.equal(history[1].layers, 250); assert.equal(history[1].videoPath, '/video/one.mp4');
});
test('media accepts actual absolute and relative URLs, preserves ports and encodes spaces', () => {
  assert.equal(mediaUrl('192.168.1.2', '/videos/my print.mp4'), 'http://192.168.1.2/videos/my%20print.mp4');
  assert.equal(mediaUrl('192.168.1.2', '192.168.1.2:3031/video'), 'http://192.168.1.2:3031/video');
  assert.equal(mediaUrl('192.168.1.2', 'http://192.168.1.2/video%20x.mp4'), 'http://192.168.1.2/video%20x.mp4');
  assert.equal(mediaUrl('192.168.1.2', 'javascript:alert(1)'), undefined);
});
test('print options preserve selected flags, full paths, layer and platform', () => {
  const file = { name: 'part.gcode', path: '/udisk/folder/part.gcode', layers: 200 };
  assert.deepEqual(printPayload(file, '12', true, false, 1), { Filename: file.path, StartLayer: 12, Calibration_switch: 1, PrintPlatformType: 1, Tlp_Switch: 0 });
  for (const layer of ['-1', '2.5', '200', 'bad', '']) assert.throws(() => printPayload(file, layer, true, true, 0));
  assert.throws(() => printPayload({ ...file, directory: true }, '0', true, true, 0));
});
test('SDK status codes do not mistake file checking for pause or completion for preparation', () => {
  assert.equal(isResumable(6), true); assert.equal(isResumable(10), false);
  assert.equal(getPrintStatus(9), 'completed'); assert.equal(getPrintStatus(8), 'stopped');
  assert.equal(isStoppable(13), true); assert.equal(isStoppable(16), true); assert.equal(isStoppable(9), false);
});
