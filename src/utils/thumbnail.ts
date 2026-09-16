// Only complete PNG/JPEG blocks are accepted; incomplete range responses are ignored.
export function gcodeThumbnail(text: string): string | undefined {
  const blocks = Array.from(
    text.matchAll(
      /;\s*thumbnail(?:_PNG|_JPG)? begin\s+\d+x\d+\s+\d+\s*\r?\n([\s\S]*?);\s*thumbnail(?:_PNG|_JPG)? end/gi
    )
  );
  for (const block of blocks.reverse()) {
    const data = block[1].replace(/^\s*;\s?/gm, '').replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) continue;
    if (data.startsWith('iVBOR')) return `data:image/png;base64,${data}`;
    if (data.startsWith('/9j/')) return `data:image/jpeg;base64,${data}`;
  }
}
