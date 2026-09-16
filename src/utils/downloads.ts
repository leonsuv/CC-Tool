import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PrintTask } from '../types';

export interface SavedVideo {
  key: string;
  name: string;
  uri: string;
  bytes: number;
  savedAt: number;
  task?: PrintTask;
}
const indexKey = 'centauri-videos-v2';
export const videoKey = (host: string, task: string) => `${host}/${task}`;
export async function savedVideos(): Promise<SavedVideo[]> {
  const raw: SavedVideo[] = JSON.parse(
    (await AsyncStorage.getItem(indexKey)) || '[]'
  );
  const valid = await Promise.all(
    raw.map(
      async entry =>
        await FileSystem.getInfoAsync(entry.uri).then(info =>
          info.exists ? entry : null
        )
    )
  );
  return valid.filter((entry): entry is SavedVideo => entry !== null);
}
export async function saveVideoIndex(entry: SavedVideo) {
  const entries = await savedVideos();
  await AsyncStorage.setItem(
    indexKey,
    JSON.stringify([...entries.filter(item => item.key !== entry.key), entry])
  );
}
export function startVideoDownload(
  url: string,
  key: string,
  onProgress: (fraction: number) => void,
  name = 'Timelapse'
) {
  // Android decodes percent-escaped slashes in file:// URIs. Use a genuine
  // single filename, never an encoded printer/task path.
  const label =
    name
      .replace(/\.(gcode|goo)$/i, '')
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 70) || 'Timelapse';
  const filename = `${label}-${Date.now()}-${key.replace(/[^a-zA-Z0-9_-]/g, '_').slice(-12)}.mp4`;
  const uri = `${FileSystem.documentDirectory}timelapses/${filename}`;
  const download = FileSystem.createDownloadResumable(
    url,
    `${uri}.part`,
    {},
    progress =>
      onProgress(
        progress.totalBytesExpectedToWrite > 0
          ? progress.totalBytesWritten / progress.totalBytesExpectedToWrite
          : -1
      )
  );
  return {
    cancel: () => download.cancelAsync(),
    run: async () => {
      await FileSystem.makeDirectoryAsync(
        `${FileSystem.documentDirectory}timelapses`,
        { intermediates: true }
      );
      try {
        const result = await download.downloadAsync();
        if (!result) throw new Error('Download abgebrochen.');
        if (result.status !== 200)
          throw new Error(
            `Download fehlgeschlagen (HTTP ${result.status}). Bitte das Video erneut öffnen.`
          );
        const contentType = Object.entries(result.headers).find(
          ([header]) => header.toLowerCase() === 'content-type'
        )?.[1];
        if (contentType && /text\/|application\/json/i.test(contentType))
          throw new Error('Der Drucker hat kein Video zurückgegeben.');
        const info = await FileSystem.getInfoAsync(result.uri);
        if (!info.exists || info.size === 0)
          throw new Error('Der Download enthält keine Videodaten.');
        await FileSystem.moveAsync({ from: result.uri, to: uri });
        return { uri, bytes: info.size };
      } catch (error) {
        const message = (error as Error).message;
        if (/ExponentFileSystem|Call to function|java\./.test(message))
          throw new Error(
            'Das Video konnte nicht gespeichert werden. Bitte die Verbindung und den freien Speicher prüfen und erneut versuchen.'
          );
        throw error;
      } finally {
        await FileSystem.deleteAsync(`${uri}.part`, { idempotent: true });
      }
    },
  };
}
