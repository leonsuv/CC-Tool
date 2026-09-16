export function cameraDocument(uri: string): string {
  const source = uri
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}</style></head><body><img src="${source}" onerror="window.ReactNativeWebView.postMessage('error')"></body></html>`;
}
