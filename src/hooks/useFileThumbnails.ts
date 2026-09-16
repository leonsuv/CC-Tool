import { useEffect, useState } from 'react';
import type { PrinterFile, PrintTask } from '../types';
import { basename, mediaUrl } from '../utils/sdcp';
import { gcodeThumbnail } from '../utils/thumbnail';

export function useFileThumbnails(
  host: string,
  enabled: boolean,
  files: PrinterFile[],
  history: PrintTask[]
) {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void (async () => {
      for (const file of files) {
        if (controller.signal.aborted) break;
        if (
          file.directory ||
          file.thumbnail ||
          history.some(
            task =>
              task.thumbnail &&
              (task.path === file.path || basename(task.path) === file.name)
          )
        )
          continue;
        // Serial, bounded requests keep the control connection responsive.
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
          const response = await fetch(mediaUrl(host, file.path)!, {
            headers: { Range: 'bytes=0-262143' },
            signal: controller.signal,
          });
          if (response.status !== 206) {
            controller.abort();
            break;
          }
          const image = gcodeThumbnail(await response.text());
          if (image && !controller.signal.aborted)
            setImages(current => ({
              ...current,
              [`${host}/${file.path}`]: image,
            }));
        } catch {
          /* A missing preview must never block printer controls. */
        } finally {
          clearTimeout(timer);
        }
      }
    })();
    return () => controller.abort();
  }, [host, enabled, files, history]);
  return images;
}
