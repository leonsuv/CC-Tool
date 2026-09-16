import type { PrinterFile, PrintTask } from '../types';
import { locale, tr } from '../i18n';

export type Payload = Record<string, any>;
const number = (...values: unknown[]): number | undefined => {
  const value = values.find(v => v !== undefined && v !== null && v !== '');
  return value !== undefined && Number.isFinite(Number(value))
    ? Number(value)
    : undefined;
};
const string = (...values: unknown[]): string => {
  const value = values.find(v => typeof v === 'string' && v.length > 0);
  return typeof value === 'string' ? value : '';
};
export const basename = (path: string) => {
  const name =
    path.replace(/\\/g, '/').split('/').filter(Boolean).pop() || path;
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
};
export const joinPath = (folder: string, path: string) =>
  path.startsWith('/') ? path : `${folder.replace(/\/$/, '')}/${path}`;

export function mediaUrl(host: string, path?: string): string | undefined {
  if (!path) return undefined;
  const value = path.trim();
  if (/^https?:\/\//i.test(value)) return encodeURI(decodeSafe(value));
  if (/^[a-z]+:/i.test(value) && !/^[\w.-]+:\d+/.test(value)) return undefined;
  if (value.startsWith('//')) return `http:${value}`;
  const url = value.startsWith('/')
    ? `http://${host}${value}`
    : value.startsWith(host) || /^[\d.]+(?::\d+)?\//.test(value)
      ? `http://${value}`
      : `http://${host}/${value}`;
  return encodeURI(decodeSafe(url));
}
function decodeSafe(value: string) {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

export function parseFiles(payload: Payload, folder: string): PrinterFile[] {
  const list = payload.FileList ?? payload.Files ?? payload.List;
  if (!Array.isArray(list))
    throw new Error(
      'Der Drucker hat keine lesbare Dateiliste geliefert. Bitte erneut laden.'
    );
  return list.flatMap((entry: any) => {
    const raw = typeof entry === 'string' ? { name: entry } : entry || {};
    const path = string(
      raw.name,
      raw.Path,
      raw.Url,
      raw.Filename,
      raw.FileName,
      raw.Name
    );
    if (!path) return [];
    return [
      {
        name: basename(path),
        path: joinPath(folder, path),
        directory:
          raw.type === 0 ||
          raw.Type === 'directory' ||
          raw.type === 'directory',
        size: number(raw.FileSize, raw.Size, raw.size),
        layers: number(raw.TotalLayers, raw.TotalLayer),
        duration: number(raw.PrintTime, raw.print_time, raw.EstimatedTime),
        createdAt: number(raw.CreateTime, raw.ModifyTime),
        thumbnail: string(raw.Thumbnail, raw.thumbnail) || undefined,
      },
    ];
  });
}

export function parseHistory(payload: Payload): PrintTask[] {
  const list = payload.HistoryDetailList;
  if (!Array.isArray(list))
    throw new Error('Druckdetails konnten nicht gelesen werden.');
  return list
    .flatMap((raw: any) => {
      const id = string(raw.TaskId, raw.Id);
      if (!id) return [];
      const slice = raw.SliceInformation || {};
      const start = number(raw.BeginTime, raw.StartTime);
      const end = number(raw.EndTime);
      const path = string(raw.TaskName, raw.Filename, raw.Name);
      const taskStatus: Record<number, string> = {
        0: 'Unbekannt',
        1: 'Abgeschlossen',
        2: 'Fehlgeschlagen',
        3: 'Abgebrochen',
      };
      return [
        {
          id,
          name: path ? basename(path) : `Druck ${id.slice(0, 8)}`,
          path,
          status:
            raw.TaskStatus !== undefined
              ? taskStatus[raw.TaskStatus] || 'Unbekannt'
              : (
                  {
                    3: 'Abgeschlossen',
                    4: 'Abgebrochen',
                    5: 'Fehlgeschlagen',
                  } as Record<number, string>
                )[raw.Status] || 'Unbekannt',
          startedAt: start,
          duration:
            start && end && end >= start ? end - start : number(raw.Duration),
          layers: number(
            slice.total_layer_numbers,
            raw.TotalLayers,
            raw.LayerCount
          ),
          printedLayers: number(raw.AlreadyPrintLayer),
          thumbnail: string(raw.Thumbnail) || undefined,
          videoStatus: number(raw.TimeLapseVideoStatus) ?? 0,
          videoPath: string(raw.TimeLapseVideoUrl) || undefined,
          filament:
            string(slice.filament_type, slice.FilamentType) || undefined,
        },
      ];
    })
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

export const videoStatusText = (status: number) =>
  tr(
    (
      {
        0: 'Nicht aufgenommen',
        1: 'Bereit',
        2: 'Video gelöscht',
        3: 'Wird erstellt',
        4: 'Erstellung fehlgeschlagen',
      } as Record<number, string>
    )[status] || 'Status unbekannt'
  );
export const durationText = (seconds?: number) =>
  seconds === undefined
    ? '—'
    : `${Math.floor(Math.max(0, seconds) / 3600)} h ${Math.floor((Math.max(0, seconds) % 3600) / 60)} min`;
export const sizeText = (bytes?: number) =>
  bytes === undefined
    ? '—'
    : bytes < 1048576
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1048576).toFixed(1)} MB`;
export const dateText = (time?: number) =>
  time
    ? new Date(time < 1e12 ? time * 1000 : time).toLocaleString(locale(), {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : tr('Datum nicht verfügbar');
export const statusText = (status?: number) =>
  tr(
    (
      {
        0: 'Bereit',
        1: 'Referenzfahrt',
        5: 'Wird pausiert',
        6: 'Pausiert',
        7: 'Wird gestoppt',
        8: 'Abgebrochen',
        9: 'Abgeschlossen',
        10: 'Datei wird geprüft',
        11: 'Druckerprüfung',
        12: 'Wird fortgesetzt',
        13: 'Druckt',
        14: 'Druckerfehler',
        15: 'Bettnivellierung',
        16: 'Aufheizen',
        17: 'Resonanztest',
        18: 'Druck startet',
        19: 'Nivellierung abgeschlossen',
        20: 'Aufgeheizt',
        21: 'Referenzfahrt abgeschlossen',
        22: 'Resonanztest abgeschlossen',
      } as Record<number, string>
    )[status ?? -1] ||
      (status === undefined ? 'Status wird geladen' : `Status ${status}`)
  );

export function printPayload(
  file: PrinterFile,
  layer: string,
  calibration: boolean,
  timelapse: boolean,
  platform: number
): Payload {
  if (file.directory || !/\.(gcode|goo)$/i.test(file.path))
    throw new Error('Bitte eine druckbare G-Code-Datei auswählen.');
  if (
    !/^\d+$/.test(layer) ||
    !Number.isSafeInteger(Number(layer)) ||
    Number(layer) < 0 ||
    (file.layers !== undefined && Number(layer) >= file.layers)
  )
    throw new Error(
      'Die Startschicht muss zwischen 0 und der letzten Schicht liegen.'
    );
  return {
    Filename: file.path,
    StartLayer: Number(layer),
    Calibration_switch: Number(calibration),
    PrintPlatformType: platform,
    Tlp_Switch: Number(timelapse),
  };
}
