const { execFileSync } = require('node:child_process');
const adb = process.env.ADB_PATH || 'adb';
const call = (...args) => execFileSync(adb, args, { encoding: 'utf8' });
const action = process.argv[2];
const target = process.argv[3];
if (action === 'input') { call('shell', 'input', 'text', target); process.exit(); }
call('shell', 'uiautomator', 'dump', '/sdcard/window.xml');
const xml = call('shell', 'cat', '/sdcard/window.xml');
const nodes = [...xml.matchAll(/<node\s+([^>]+)/g)].map(match => Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(value => [value[1], value[2].replace(/&#10;/g, '\n').replace(/&amp;/g, '&')])));
if (action === 'list') { for (const node of nodes) if (node.text || node['content-desc']) console.log(JSON.stringify({ text: node.text, desc: node['content-desc'], bounds: node.bounds, enabled: node.enabled })); }
else if (action === 'tap') {
  const node = nodes.find(node => node['content-desc'] === target || node.text === target);
  if (!node) throw new Error(`Not found: ${target}`);
  const [x1,y1,x2,y2] = node.bounds.match(/\d+/g).map(Number);
  call('shell','input','tap',String(Math.round((x1+x2)/2)),String(Math.round((y1+y2)/2)));
}
