import { useCallback, useEffect, useRef, useState } from 'react';
import { usePrinterConnections } from '../contexts/PrinterConnectionsContext';
import type { PrinterFile, PrintTask } from '../types';
import { parseFiles, parseHistory } from '../utils/sdcp';

export function usePrinterLibrary(printerId: string, connected: boolean) {
  const { requestFeature } = usePrinterConnections();
  const [folder, setFolder] = useState('/local');
  const [files, setFiles] = useState<PrinterFile[]>([]);
  const [history, setHistory] = useState<PrintTask[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filesError, setFilesError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const fileGeneration = useRef(0);
  const historyGeneration = useRef(0);
  const loadFiles = useCallback(
    async (path: string) => {
      const generation = ++fileGeneration.current;
      setFolder(path);
      setFilesLoading(true);
      setFilesError('');
      setFiles([]);
      try {
        const result = parseFiles(
          await requestFeature(printerId, 258, { Url: path }),
          path
        );
        if (generation === fileGeneration.current) setFiles(result);
      } catch (error) {
        if (generation === fileGeneration.current)
          setFilesError((error as Error).message);
      } finally {
        if (generation === fileGeneration.current) setFilesLoading(false);
      }
    },
    [printerId, requestFeature]
  );
  const loadHistory = useCallback(async () => {
    const generation = ++historyGeneration.current;
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const response = await requestFeature(printerId, 320);
      if (!Array.isArray(response.HistoryData))
        throw new Error('Der Drucker hat keinen lesbaren Verlauf geliefert.');
      const ids = response.HistoryData.filter(
        (id: unknown): id is string => typeof id === 'string'
      );
      const tasks: PrintTask[] = [];
      for (let index = 0; index < ids.length; index += 20) {
        if (generation !== historyGeneration.current) return;
        const result = await requestFeature(printerId, 321, {
          Id: ids.slice(index, index + 20),
        });
        tasks.push(...parseHistory(result));
      }
      if (generation === historyGeneration.current)
        setHistory(
          tasks.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        );
    } catch (error) {
      if (generation === historyGeneration.current)
        setHistoryError((error as Error).message);
    } finally {
      if (generation === historyGeneration.current) setHistoryLoading(false);
    }
  }, [printerId, requestFeature]);
  useEffect(() => {
    const fileCounter = fileGeneration;
    const historyCounter = historyGeneration;
    if (connected) {
      void loadFiles('/local');
      void loadHistory();
    }
    return () => {
      fileCounter.current++;
      historyCounter.current++;
    };
  }, [connected, loadFiles, loadHistory]);
  return {
    folder,
    files,
    history,
    filesLoading,
    historyLoading,
    filesError,
    historyError,
    loadFiles,
    loadHistory,
  };
}
