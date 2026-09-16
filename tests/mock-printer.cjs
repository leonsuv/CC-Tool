// Local QA device. Never connects to, discovers, or controls a physical printer.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');
const port = 18888;
const fixtures = path.join(__dirname, 'fixtures');
let printStatus = 0;
let filename = '';
const files = [
  { name: '/local/Spiralvase – Salbeigrün.gcode', FileSize: 14567890, TotalLayers: 482, CreateTime: 1789362000, type: 1 },
  { name: '/local/Schreibtisch Organizer mit Stiftehalter.gcode', FileSize: 28867323, TotalLayers: 320, CreateTime: 1789272000, type: 1 },
  { name: '/local/Kabelclip_USB-C.gcode', FileSize: 540000, TotalLayers: 48, CreateTime: 1789182000, type: 1 },
  { name: '/local/Modelle', type: 0 },
];
const history = [
  { TaskId: 'vase-001', TaskName: files[0].name, TaskStatus: 1, BeginTime: 1789362000, EndTime: 1789371420, AlreadyPrintLayer: 482, SliceInformation: { total_layer_numbers: 482, filament_type: 'PLA' }, TimeLapseVideoStatus: 1, TimeLapseVideoUrl: '/internal/vase.mp4', Thumbnail: '/thumb.png' },
  { TaskId: 'desk-002', TaskName: files[1].name, TaskStatus: 3, BeginTime: 1789272000, EndTime: 1789276200, AlreadyPrintLayer: 141, SliceInformation: { total_layer_numbers: 320 }, TimeLapseVideoStatus: 3, Thumbnail: '/thumb.png' },
  { TaskId: 'clip-003', TaskName: files[2].name, TaskStatus: 1, BeginTime: 1789182000, EndTime: 1789183800, AlreadyPrintLayer: 48, SliceInformation: { total_layer_numbers: 48 }, TimeLapseVideoStatus: 0 },
];
const state = { CurrentStatus: [0], TimeLapseStatus: 0, PlatFormType: 0, TempOfHotbed: 26.3, TempOfNozzle: 27.2, TempOfBox: 25.1, TempTargetHotbed: 0, TempTargetNozzle: 0, TempTargetBox: 0, CurrentFanSpeed: { ModelFan: 0, AuxiliaryFan: 25, BoxFan: 10 }, LightStatus: { SecondLight: 1 }, PrintInfo: {} };
const server = http.createServer((req, res) => {
  if (req.url === '/thumb.png') { res.writeHead(200, { 'Content-Type': 'image/png' }); fs.createReadStream(path.join(__dirname, '../assets/CC.png')).pipe(res); return; }
  if (req.url === '/videos/vase.mp4') {
    const video = path.join(fixtures, 'sample.mp4');
    if (!fs.existsSync(video)) { res.writeHead(404); res.end(); return; }
    const size = fs.statSync(video).size;
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/);
    const start = range ? Number(range[1]) : 0; const end = range && range[2] ? Number(range[2]) : size - 1;
    res.writeHead(range ? 206 : 200, { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
    fs.createReadStream(video, { start, end }).pipe(res); return;
  }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, path: '/websocket' });
wss.on('connection', ws => {
  const status = () => {
    state.PrintInfo = { Status: printStatus, Filename: filename, Progress: printStatus ? 42 : 0, CurrentLayer: 202, TotalLayer: 482, CurrentTicks: 3960, TotalTicks: 9420, PrintSpeedPct: 100 };
    ws.send(JSON.stringify({ MainboardID: 'mock-only', Status: state }));
  };
  ws.on('message', raw => {
    const { Data: command } = JSON.parse(raw);
    console.log(JSON.stringify({ cmd: command.Cmd, data: command.Data, request: command.RequestID }));
    let data = { Ack: 0 };
    switch (command.Cmd) {
      case 0: status(); break;
      case 1: ws.send(JSON.stringify({ Attributes: { MachineName: 'Centauri Carbon', FirmwareVersion: 'QA Simulator', RemainingMemory: 2362345678 } })); break;
      case 258: data.FileList = command.Data.Url === '/local' ? files : command.Data.Url === '/local/Modelle' ? [{ name: 'Ersatzteil.gcode', FileSize: 400000, type: 1 }] : []; break;
      case 320: data.HistoryData = history.map(task => task.TaskId); break;
      case 321: data.HistoryDetailList = history.filter(task => command.Data.Id.includes(task.TaskId)); break;
      case 323: data.Data = ['/videos/vase.mp4']; break;
      case 128: filename = command.Data.Filename; printStatus = 13; state.TimeLapseStatus = command.Data.Tlp_Switch; status(); break;
      case 129: printStatus = 6; status(); break;
      case 131: printStatus = 13; status(); break;
      case 130: printStatus = 8; status(); break;
      case 259: for (const name of command.Data.FileList) { const index = files.findIndex(file => file.name === name); if (index >= 0) files.splice(index, 1); } break;
      case 403: if (command.Data.TargetFanSpeed) Object.assign(state.CurrentFanSpeed, command.Data.TargetFanSpeed); else Object.assign(state, command.Data); status(); break;
      default: data.Ack = 1;
    }
    ws.send(JSON.stringify({ Data: { Cmd: command.Cmd, Data: data, RequestID: command.RequestID } }));
  });
});
server.listen(port, '127.0.0.1', () => console.log(`Mock printer: localhost:${port}`));
