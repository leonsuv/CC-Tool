import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, AppState } from 'react-native';
import type { Printer, PrinterStatus } from '../types';
import type { Payload } from '../utils/sdcp';

interface ConnectionContext {
  printers: Printer[];
  addPrinter: (name: string, host: string) => void;
  removePrinter: (id: string) => void;
  reconnectAll: () => void;
  sendCommand: (id: string, command: any) => void;
  requestFeature: (id: string, cmd: number, data?: Payload) => Promise<Payload>;
}
const Context = createContext<ConnectionContext | undefined>(undefined);
type Pending = {
  printerId: string;
  cmd: number;
  data: Payload;
  resolve: (value: Payload) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
let serial = 0;
const requestId = () => `${Date.now().toString(36)}-${(++serial).toString(36)}`;

export function PrinterConnectionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const printerRef = useRef<Printer[]>([]);
  const sockets = useRef<Record<string, WebSocket>>({});
  const timers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const pending = useRef<Record<string, Pending>>({});
  const alive = useRef(true);

  const update = useCallback((id: string, patch: Partial<Printer>) => {
    printerRef.current = printerRef.current.map(p =>
      p.id === id ? { ...p, ...patch } : p
    );
    if (alive.current) setPrinters(printerRef.current);
  }, []);
  const save = useCallback(() => {
    const data = printerRef.current.map(({ id, printerName, ipAddress }) => ({
      id,
      printerName,
      ipAddress,
    }));
    void AsyncStorage.setItem('printers', JSON.stringify(data)).catch(() =>
      Alert.alert(
        'Speichern fehlgeschlagen',
        'Die Druckerliste konnte nicht gespeichert werden.'
      )
    );
  }, []);
  const failPending = useCallback((id: string, message: string) => {
    Object.entries(pending.current).forEach(([key, request]) => {
      if (request.printerId !== id) return;
      clearTimeout(request.timer);
      delete pending.current[key];
      request.reject(new Error(message));
    });
  }, []);
  const requestFeature = useCallback(
    (id: string, cmd: number, data: Payload = {}): Promise<Payload> => {
      const ws = sockets.current[id];
      if (!ws || ws.readyState !== WebSocket.OPEN)
        return Promise.reject(
          new Error(
            'Drucker offline. Bitte im selben WLAN verbinden und erneut versuchen.'
          )
        );
      const key = requestId();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          delete pending.current[key];
          reject(
            new Error(
              [128, 129, 130, 131, 192, 259, 387, 403].includes(cmd)
                ? 'Keine Bestätigung vom Drucker. Der Befehl könnte angekommen sein. Bitte den Druckerstatus prüfen, bevor du erneut sendest.'
                : 'Der Drucker antwortet nicht auf diese Anfrage. Bitte erneut laden.'
            )
          );
        }, cmd === 323 ? 120000 : 15000);
        pending.current[key] = {
          printerId: id,
          cmd,
          data,
          resolve,
          reject,
          timer,
        };
        const board =
          printerRef.current.find(p => p.id === id)?.mainboardId || '';
        try {
          ws.send(
            JSON.stringify({
              Id: '',
              Data: {
                Cmd: cmd,
                Data: data,
                RequestID: key,
                MainboardID: board,
                TimeStamp: Date.now(),
                From: 1,
              },
            })
          );
        } catch {
          clearTimeout(timer);
          delete pending.current[key];
          reject(new Error('Die Verbindung wurde unterbrochen.'));
        }
      });
    },
    []
  );

  const connect = useCallback(
    (printer: Printer) => {
      const id = printer.id;
      const old = sockets.current[id];
      delete sockets.current[id];
      if (old) {
        old.onclose = null;
        old.onerror = null;
        old.onmessage = null;
        old.close();
      }
      clearInterval(timers.current[id]);
      failPending(id, 'Verbindung wird neu aufgebaut.');
      update(id, { connectionStatus: 'connecting', videoUrl: undefined });
      const ws = new WebSocket(`ws://${printer.ipAddress}/websocket`);
      sockets.current[id] = ws;
      const timeout = setTimeout(() => {
        if (sockets.current[id] !== ws) return;
        update(id, { connectionStatus: 'timeout' });
        ws.close();
      }, 6000);
      ws.onopen = () => {
        if (sockets.current[id] !== ws) return;
        clearTimeout(timeout);
        update(id, { connectionStatus: 'connected' });
        void requestFeature(id, 0).catch(() => {});
        void requestFeature(id, 1).catch(() => {});
        timers.current[id] = setInterval(() => {
          void requestFeature(id, 0).catch(() => {});
        }, 25000);
      };
      ws.onmessage = event => {
        if (sockets.current[id] !== ws) return;
        try {
          const message = JSON.parse(event.data);
          const status = message.Status || message.Data?.Status;
          const attributes = message.Attributes || message.Data?.Attributes;
          const board = message.MainboardID || message.Data?.MainboardID;
          if (board) update(id, { mainboardId: board });
          if (status) {
            const previous = printerRef.current.find(p => p.id === id)?.status;
            update(id, {
              status: {
                ...previous,
                ...status,
                PrintInfo: { ...previous?.PrintInfo, ...status.PrintInfo },
                CurrentFanSpeed: {
                  ...previous?.CurrentFanSpeed,
                  ...status.CurrentFanSpeed,
                },
                LightStatus: {
                  ...previous?.LightStatus,
                  ...status.LightStatus,
                },
              } as PrinterStatus,
              lastUpdate: Date.now(),
            });
          }
          if (attributes) update(id, { deviceAttributes: attributes });
          const envelope = message.Data;
          const payload = envelope?.Data || {};
          let key = envelope?.RequestID;
          if (attributes || status) {
            const target = attributes ? 1 : 0;
            Object.entries(pending.current).forEach(([requestKey, request]) => {
              if (request.printerId === id && request.cmd === target) {
                clearTimeout(request.timer);
                delete pending.current[requestKey];
                request.resolve(attributes || status);
              }
            });
          }
          if (!key && typeof envelope?.Cmd === 'number') {
            const matches = Object.entries(pending.current).filter(
              ([, p]) => p.printerId === id && p.cmd === envelope.Cmd
            );
            if (matches.length === 1) key = matches[0][0];
          }
          const request = pending.current[key];
          if (!request || request.printerId !== id) return;
          if (payload.Ack !== undefined && Number(payload.Ack) !== 0) {
            clearTimeout(request.timer);
            delete pending.current[key];
            const reason =
              Number(payload.Ack) === 2 && request.cmd === 128
                ? 'Datei nicht gefunden. Bitte die Dateiliste aktualisieren.'
                : `Der Drucker hat die Anfrage abgelehnt (Code ${payload.Ack}). Die Funktion kann vom aktuellen Druckzustand oder der Firmware abhängen.`;
            request.reject(new Error(reason));
            return;
          }
          // Read commands acknowledge first; the actual data arrives on a separate topic.
          if (
            (request.cmd === 0 || request.cmd === 1) &&
            !status &&
            !attributes &&
            Object.keys(payload).every(k => k === 'Ack')
          )
            return;
          clearTimeout(request.timer);
          delete pending.current[key];
          if (request.cmd === 386) update(id, { videoUrl: payload.VideoUrl });
          request.resolve(payload);
          if (request.cmd === 192 && typeof request.data.Name === 'string') {
            update(id, { printerName: request.data.Name });
            save();
          }
          if ([128, 129, 130, 131, 192, 387, 403].includes(request.cmd))
            void requestFeature(id, 0).catch(() => {});
        } catch {
          /* Ignore ping/pong or malformed broadcasts. Requests still time out. */
        }
      };
      ws.onerror = () => {
        if (sockets.current[id] !== ws) return;
        clearTimeout(timeout);
        clearInterval(timers.current[id]);
        update(id, { connectionStatus: 'error' });
        failPending(id, 'Netzwerkfehler. Bitte die Druckerverbindung prüfen.');
      };
      ws.onclose = () => {
        clearTimeout(timeout);
        if (sockets.current[id] !== ws) return;
        clearInterval(timers.current[id]);
        const state = printerRef.current.find(
          p => p.id === id
        )?.connectionStatus;
        if (state !== 'error' && state !== 'timeout')
          update(id, { connectionStatus: 'disconnected', videoUrl: undefined });
        failPending(id, 'Die Verbindung zum Drucker wurde getrennt.');
      };
    },
    [failPending, requestFeature, update, save]
  );

  useEffect(() => {
    const socketMap = sockets.current;
    const timerMap = timers.current;
    alive.current = true;
    void AsyncStorage.getItem('printers')
      .then(json => {
        if (!alive.current) return;
        const saved = json ? JSON.parse(json) : [];
        printerRef.current = saved.map((p: Printer) => ({
          id: p.id,
          printerName: p.printerName,
          ipAddress: p.ipAddress,
          connectionStatus: 'disconnected',
        }));
        setPrinters(printerRef.current);
        printerRef.current.forEach(connect);
      })
      .catch(() =>
        Alert.alert(
          'Druckerliste nicht lesbar',
          'Bitte den Drucker erneut hinzufügen.'
        )
      );
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active')
        printerRef.current
          .filter(p => p.connectionStatus !== 'connected')
          .forEach(connect);
    });
    return () => {
      alive.current = false;
      subscription.remove();
      Object.keys(socketMap).forEach(id => {
        failPending(id, 'Verbindung beendet.');
        socketMap[id].close();
      });
      Object.values(timerMap).forEach(clearInterval);
    };
  }, [connect, failPending]);
  const addPrinter = (printerName: string, host: string) => {
    const ipAddress = host
      .trim()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');
    if (!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(ipAddress))
      throw new Error(
        'Bitte eine gültige IP-Adresse oder einen Hostnamen eingeben.'
      );
    if (printerRef.current.some(p => p.ipAddress === ipAddress))
      throw new Error('Dieser Drucker ist bereits gespeichert.');
    const printer: Printer = {
      id: requestId(),
      printerName: printerName.trim(),
      ipAddress,
      connectionStatus: 'connecting',
    };
    printerRef.current = [...printerRef.current, printer];
    setPrinters(printerRef.current);
    save();
    connect(printer);
  };
  const removePrinter = (id: string) => {
    const ws = sockets.current[id];
    delete sockets.current[id];
    ws?.close();
    clearInterval(timers.current[id]);
    failPending(id, 'Drucker entfernt.');
    printerRef.current = printerRef.current.filter(p => p.id !== id);
    setPrinters(printerRef.current);
    save();
  };
  const reconnectAll = useCallback(
    () => printerRef.current.forEach(connect),
    [connect]
  );
  const sendCommand = (id: string, command: any) => {
    void requestFeature(id, command.Data.Cmd, command.Data.Data).catch(error =>
      Alert.alert('Anfrage fehlgeschlagen', error.message)
    );
  };
  return (
    <Context.Provider
      value={{
        printers,
        addPrinter,
        removePrinter,
        reconnectAll,
        requestFeature,
        sendCommand,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function usePrinterConnections() {
  const context = useContext(Context);
  if (!context) throw new Error('PrinterConnectionsProvider fehlt');
  return context;
}
