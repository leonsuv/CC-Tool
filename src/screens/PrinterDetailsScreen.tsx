import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { usePrinterConnections } from '../contexts/PrinterConnectionsContext';
import { usePrinterLibrary } from '../hooks/usePrinterLibrary';
import { useFileThumbnails } from '../hooks/useFileThumbnails';
import {
  Badge,
  Button,
  EmptyState,
  SearchField,
  Thumb,
  ui,
  usePalette,
} from '../components/StudioUI';
import { PrintOptions } from '../components/PrintOptions';
import { TimelapsePlayer } from '../components/TimelapsePlayer';
import { LiveCamera, FanSlider } from '../components/PrinterControls';
import {
  basename,
  dateText,
  durationText,
  mediaUrl,
  sizeText,
  statusText,
  videoStatusText,
} from '../utils/sdcp';
import {
  saveVideoIndex,
  savedVideos,
  startVideoDownload,
  videoKey,
} from '../utils/downloads';
import type { SavedVideo } from '../utils/downloads';
import type { PrinterFile, PrintTask } from '../types';
import { isPausable, isResumable, isStoppable } from '../types';
import { tr } from '../i18n';

type Tab = 'overview' | 'files' | 'history' | 'videos';
const tabs: { id: Tab; name: string; icon: keyof typeof Ionicons.glyphMap }[] =
  [
    { id: 'overview', name: 'Übersicht', icon: 'grid-outline' },
    { id: 'files', name: 'Dateien', icon: 'folder-open-outline' },
    { id: 'history', name: 'Verlauf', icon: 'time-outline' },
    { id: 'videos', name: 'Timelapses', icon: 'film-outline' },
  ];

export function PrinterDetailsScreen({ navigation, route }: any) {
  const c = usePalette();
  const { printerId } = route.params;
  const { printers, requestFeature, reconnectAll, removePrinter } =
    usePrinterConnections();
  const printer = printers.find(p => p.id === printerId);
  const connected = printer?.connectionStatus === 'connected';
  const library = usePrinterLibrary(printerId, connected);
  const [tab, setTab] = useState<Tab>('overview');
  const fileThumbnails = useFileThumbnails(
    printer?.ipAddress || '',
    connected &&
      tab === 'files' &&
      !library.historyLoading &&
      !library.filesLoading,
    library.files,
    library.history
  );
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'name' | 'date'>('name');
  const [historyFilter, setHistoryFilter] = useState('Alle');
  const [selectedFile, setSelectedFile] = useState<PrinterFile>();
  const [selectedTask, setSelectedTask] = useState<PrintTask>();
  const [camera, setCamera] = useState<string>();
  const [cameraError, setCameraError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [failure, setFailure] = useState('');
  const [video, setVideo] = useState<{ task: PrintTask; uri: string }>();
  const [downloads, setDownloads] = useState<SavedVideo[]>([]);
  const [download, setDownload] = useState<{ id: string; progress: number }>();
  const downloadRef = useRef<ReturnType<typeof startVideoDownload> | undefined>(
    undefined
  );
  const actionLock = useRef(false);
  const [setting, setSetting] = useState<{
    label: string;
    key: string;
    max: number;
    value: string;
    fan?: boolean;
  }>();
  const [newName, setNewName] = useState('');
  useEffect(() => {
    void savedVideos()
      .then(setDownloads)
      .catch(() => {});
  }, []);
  useEffect(
    () => () => {
      void downloadRef.current?.cancel();
    },
    []
  );

  if (!printer)
    return (
      <EmptyState
        title="Drucker nicht gefunden"
        text="Bitte zur Druckerliste zurückgehen."
      />
    );
  const host = printer.ipAddress;
  const status = printer.status;
  const print = status?.PrintInfo;
  const printCode = print?.Status;
  const ready =
    connected && printCode !== undefined && [0, 8, 9].includes(printCode);
  const active = printCode !== undefined && isStoppable(printCode);
  const card = [ui.card, { backgroundColor: c.card, borderColor: c.line }];
  const localVideo = (task: PrintTask) =>
    downloads.find(item => item.key === videoKey(host, task.id));
  const thumb = (file: PrinterFile) =>
    fileThumbnails[`${host}/${file.path}`] ||
    mediaUrl(
      host,
      file.thumbnail ||
        library.history.find(
          item =>
            !!item.thumbnail &&
            (item.path === file.path || basename(item.path) === file.name)
        )?.thumbnail
    );
  const run = async (key: string, action: () => Promise<void>) => {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(key);
    setFailure('');
    setNotice('');
    try {
      await action();
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      actionLock.current = false;
      setBusy('');
    }
  };
  const command = (cmd: number, label: string) =>
    void run(label, async () => {
      await requestFeature(printerId, cmd);
      setNotice(`${label} bestätigt.`);
    });
  const deleteFile = (file: PrinterFile) => {
    if (active && basename(print?.Filename || '') === file.name) {
      setFailure('Die aktuell gedruckte Datei kann nicht gelöscht werden.');
      return;
    }
    Alert.alert(
      'Datei löschen?',
      `${file.name}\n\nDie Datei wird dauerhaft vom Drucker entfernt.`,
      [
        { text: 'Behalten', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: () =>
            void run('delete', async () => {
              await requestFeature(printerId, 259, {
                FileList: [file.path],
                FolderList: [],
              });
              setNotice('Datei gelöscht.');
              await library.loadFiles(library.folder);
            }),
        },
      ]
    );
  };
  const prepareVideo = async (task: PrintTask) => {
    if (!task.videoPath)
      throw new Error('Der Drucker meldet keinen Videopfad für diesen Druck.');
    const result = await requestFeature(printerId, 323, {
      Url: [task.videoPath],
    });
    const path = Array.isArray(result.Data) ? result.Data[0] : result.VideoUrl;
    if (typeof path !== 'string' || !path)
      throw new Error(
        'Der Drucker konnte das Video nicht freigeben. Bitte später erneut versuchen.'
      );
    const uri = mediaUrl(host, path);
    if (!uri) throw new Error('Die Video-Adresse wird nicht unterstützt.');
    return uri;
  };
  const watchVideo = (task: PrintTask) =>
    void run(`watch-${task.id}`, async () => {
      const uri = localVideo(task)?.uri || (await fetchVideo(task));
      setVideo({ task, uri });
    });
  const fetchVideo = async (task: PrintTask) => {
    const url = await prepareVideo(task);
    setDownload({ id: task.id, progress: 0 });
    const key = videoKey(host, task.id);
    const job = startVideoDownload(
      url,
      key,
      progress => setDownload({ id: task.id, progress }),
      task.name
    );
    downloadRef.current = job;
    try {
      const result = await job.run();
      await saveVideoIndex({
        key,
        name: task.name,
        task,
        ...result,
        savedAt: Date.now(),
      });
      setDownloads(await savedVideos());
      return result.uri;
    } finally {
      downloadRef.current = undefined;
      setDownload(undefined);
    }
  };
  const downloadVideo = (task: PrintTask) =>
    void run(`download-${task.id}`, async () => {
      if (downloadRef.current) return;
      const existing = localVideo(task);
      if (existing) {
        setNotice('Dieses Video ist bereits offline gespeichert.');
        return;
      }
      const url = await prepareVideo(task);
      setDownload({ id: task.id, progress: 0 });
      const key = videoKey(host, task.id);
      const job = startVideoDownload(
        url,
        key,
        progress => setDownload({ id: task.id, progress }),
        task.name
      );
      downloadRef.current = job;
      try {
        const result = await job.run();
        const entry = {
          key,
          name: task.name,
          task,
          ...result,
          savedAt: Date.now(),
        };
        await saveVideoIndex(entry);
        setDownloads(await savedVideos());
        setNotice(
          'Video offline in der App gespeichert. Über „Teilen“ kannst du es exportieren.'
        );
      } finally {
        downloadRef.current = undefined;
        setDownload(undefined);
      }
    });
  const shareVideo = (task: PrintTask) =>
    void run('share', async () => {
      const saved = localVideo(task);
      if (!saved) return;
      if (!(await Sharing.isAvailableAsync()))
        throw new Error('Teilen ist auf diesem Gerät nicht verfügbar.');
      await Sharing.shareAsync(saved.uri, {
        mimeType: 'video/mp4',
        dialogTitle: `${task.name} – Timelapse`,
        UTI: 'public.mpeg-4',
      });
    });
  const videoButtons = (task: PrintTask) => {
    const saved = localVideo(task);
    const available =
      !!saved || (task.videoStatus === 1 && !!task.videoPath && connected);
    return (
      <View style={{ gap: 10 }}>
        <View style={[ui.row, { flexWrap: 'wrap' }]}>
          <Button
            label="Ansehen"
            icon="play"
            onPress={() => watchVideo(task)}
            disabled={!available || !!busy}
          />
          {saved ? (
            <Button
              label="Teilen"
              icon="share-outline"
              secondary
              onPress={() => shareVideo(task)}
              disabled={!!busy}
            />
          ) : (
            <Button
              label="Herunterladen"
              icon="download-outline"
              secondary
              onPress={() => downloadVideo(task)}
              disabled={!available || !!busy}
            />
          )}
        </View>
        {saved && (
          <Text style={{ color: c.accent, fontSize: 12 }}>
            Offline gespeichert · {sizeText(saved.bytes)}
          </Text>
        )}
      </View>
    );
  };
  const refresh = () => {
    if (!connected) reconnectAll();
    else if (tab === 'files') void library.loadFiles(library.folder);
    else if (tab === 'overview')
      void run('refresh', async () => {
        await requestFeature(printerId, 0);
      });
    else void library.loadHistory();
  };
  const changeTab = (value: Tab) => {
    setTab(value);
    setQuery('');
    setFailure('');
    setNotice('');
  };
  const showSetting = (
    label: string,
    key: string,
    max: number,
    value: number | undefined,
    fan = false
  ) => setSetting({ label, key, max, value: String(value ?? 0), fan });

  const renderFile = ({ item }: { item: PrinterFile }) => (
    <View style={[card, { padding: 15, gap: 12, marginBottom: 12 }]}>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          item.directory
            ? void library.loadFiles(item.path)
            : setSelectedFile(item)
        }
        style={ui.row}
      >
        {item.directory ? (
          <Ionicons
            name="folder"
            size={44}
            color={c.accent}
            style={{ width: 72, textAlign: 'center' }}
          />
        ) : (
          <Thumb
            uri={thumb(item)}
            alternatives={library.history
              .filter(
                task =>
                  task.path === item.path || basename(task.path) === item.name
              )
              .map(task => mediaUrl(host, task.thumbnail))
              .filter((uri): uri is string => !!uri)}
          />
        )}
        <View style={{ flex: 1, gap: 5 }}>
          <Text
            style={{
              color: c.text,
              fontSize: 16,
              fontWeight: '600',
              lineHeight: 22,
            }}
            numberOfLines={3}
          >
            {item.name}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {item.directory
              ? tr('Ordner öffnen')
              : `${sizeText(item.size)}${item.layers ? ` · ${item.layers} ${tr('Schichten')}` : ''}`}
          </Text>
          {!!item.createdAt && (
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {dateText(item.createdAt)}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.muted} />
      </Pressable>
      {!item.directory && (
        <View style={ui.between}>
          <Button
            label="Druckoptionen"
            icon="options-outline"
            secondary
            onPress={() => setSelectedFile(item)}
          />
          <Pressable
            accessibilityLabel={`${item.name} löschen`}
            disabled={!connected || !!busy}
            hitSlop={8}
            style={{ padding: 12, opacity: connected && !busy ? 1 : 0.4 }}
            onPress={() => deleteFile(item)}
          >
            <Ionicons name="trash-outline" size={20} color={c.danger} />
          </Pressable>
        </View>
      )}
    </View>
  );
  const renderHistory = ({ item }: { item: PrintTask }) => (
    <Pressable
      onPress={() => setSelectedTask(item)}
      accessibilityRole="button"
      style={[card, { padding: 16, marginBottom: 12 }]}
    >
      <View style={ui.row}>
        <Thumb uri={mediaUrl(host, item.thumbnail)} />
        <View style={{ flex: 1, gap: 6 }}>
          <Text
            style={{ color: c.text, fontSize: 16, fontWeight: '600' }}
            numberOfLines={3}
          >
            {item.name}
          </Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {dateText(item.startedAt)}
          </Text>
        </View>
        <Ionicons name="chevron-forward" color={c.muted} size={18} />
      </View>
      <View style={ui.between}>
        <Badge text={item.status} good={item.status === 'Abgeschlossen'} />
        <Text style={{ color: c.muted, fontSize: 13 }}>
          {durationText(item.duration)}
        </Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>
        {item.printedLayers ?? '—'} / {item.layers ?? '—'} {tr('Schichten')} ·
        Timelapse: {videoStatusText(item.videoStatus)}
      </Text>
    </Pressable>
  );
  const renderVideo = ({ item }: { item: PrintTask }) => (
    <View style={[card, { padding: 16, marginBottom: 15 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name} ansehen`}
        onPress={() =>
          (localVideo(item) || (item.videoStatus === 1 && item.videoPath)) &&
          watchVideo(item)
        }
        disabled={!!busy}
      >
        <Thumb uri={mediaUrl(host, item.thumbnail)} large video />
        {(localVideo(item) || item.videoStatus === 1) && (
          <View
            style={{
              position: 'absolute',
              top: 65,
              alignSelf: 'center',
              backgroundColor: '#173D30E6',
              width: 48,
              height: 48,
              borderRadius: 24,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Ionicons name="play" size={23} color="#FFFFFF" />
          </View>
        )}
      </Pressable>
      <View style={{ gap: 6 }}>
        <Text style={[ui.heading, { color: c.text }]}>{item.name}</Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          {dateText(item.startedAt)} · {durationText(item.duration)}{' '}
          {tr('DRUCKZEIT')}
        </Text>
      </View>
      <Badge
        text={
          localVideo(item)
            ? 'Offline verfügbar'
            : videoStatusText(item.videoStatus)
        }
        good={item.videoStatus === 1 || !!localVideo(item)}
      />
      {item.videoStatus === 1 || localVideo(item) ? (
        videoButtons(item)
      ) : (
        <Text style={[ui.body, { color: c.muted }]}>
          {item.videoStatus === 3
            ? tr(
                'Der Drucker erstellt das Video noch. Aktualisiere die Liste später.'
              )
            : tr(
                'Für diesen Druck steht aktuell kein Video zum Download bereit.'
              )}
        </Text>
      )}
    </View>
  );

  const filteredFiles = library.files
    .filter(file =>
      file.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
    )
    .sort(
      (a, b) =>
        Number(!!b.directory) - Number(!!a.directory) ||
        (sort === 'name'
          ? a.name.localeCompare(b.name, 'de', { numeric: true })
          : (b.createdAt || 0) - (a.createdAt || 0))
    );
  const filteredHistory = library.history.filter(
    task =>
      task.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
      (historyFilter === 'Alle' || task.status === historyFilter)
  );
  const remoteVideoTasks = library.history.filter(
    task => task.videoStatus > 0 || !!localVideo(task)
  );
  const offlineTasks: PrintTask[] = downloads
    .filter(
      saved =>
        saved.key.startsWith(`${host}/`) &&
        !remoteVideoTasks.some(task => videoKey(host, task.id) === saved.key)
    )
    .map(
      saved =>
        saved.task || {
          id: saved.key.slice(host.length + 1),
          name: saved.name,
          path: '',
          status: 'Offline gespeichert',
          videoStatus: 1,
        }
    );
  const videoTasks = [...remoteVideoTasks, ...offlineTasks].filter(task =>
    task.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View
        style={{
          paddingHorizontal: 22,
          paddingTop: 6,
          paddingBottom: 8,
          gap: 4,
        }}
      >
        <View style={ui.between}>
          <Pressable
            accessibilityLabel="Zur Druckerliste"
            onPress={() => navigation.goBack()}
            hitSlop={14}
          >
            <Ionicons name="arrow-back" size={23} color={c.text} />
          </Pressable>
          <Text style={[ui.label, { color: c.muted }]}>
            {tab === 'files' ? printer.printerName : 'CC TOOL / STUDIO'}
          </Text>
          <Pressable
            accessibilityLabel="Aktualisieren"
            onPress={refresh}
            hitSlop={14}
          >
            <Ionicons name="refresh" size={22} color={c.text} />
          </Pressable>
        </View>
        <View style={ui.between}>
          <View style={{ flex: 1, gap: 5 }}>
            {tab !== 'files' && (
              <Text style={[ui.heading, { color: c.text }]} numberOfLines={1}>
                {printer.printerName}
              </Text>
            )}
            <Text style={{ fontSize: 12, color: c.muted }}>{host}</Text>
          </View>
          <Badge
            text={
              connected
                ? statusText(printCode)
                : printer.connectionStatus === 'connecting'
                  ? 'Verbindet …'
                  : 'Offline'
            }
            good={connected}
          />
        </View>
        {active && (
          <View style={{ gap: 6 }}>
            <Text numberOfLines={2} style={{ color: c.text, fontSize: 13 }}>
              {basename(print?.Filename || '')}
            </Text>
            <View style={ui.between}>
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {print?.CurrentLayer ?? 0} / {print?.TotalLayer ?? 0} Schichten
              </Text>
              <Text style={{ color: c.accent }}>
                {Math.round(print?.Progress || 0)} %
              </Text>
            </View>
            <View
              style={{ height: 5, backgroundColor: c.line, borderRadius: 4 }}
            >
              <View
                style={{
                  height: 5,
                  borderRadius: 4,
                  backgroundColor: c.accent,
                  width: `${Math.max(0, Math.min(100, print?.Progress || 0))}%`,
                }}
              />
            </View>
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: 'row',
          paddingHorizontal: 12,
          borderBottomWidth: 1,
          borderColor: c.line,
        }}
      >
        {tabs.map(item => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === item.id }}
            key={item.id}
            onPress={() => changeTab(item.id)}
            style={{
              flex: 1,
              paddingVertical: 8,
              alignItems: 'center',
              gap: 3,
              borderBottomWidth: 3,
              borderColor: tab === item.id ? c.accent : 'transparent',
            }}
          >
            <Ionicons
              name={item.icon}
              color={tab === item.id ? c.accent : c.muted}
              size={19}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '700',
                color: tab === item.id ? c.accent : c.muted,
              }}
            >
              {tr(item.name)}
            </Text>
          </Pressable>
        ))}
      </View>
      {!connected && (
        <View style={{ padding: 14, backgroundColor: c.soft }}>
          <Text style={[ui.body, { color: c.text }]}>
            {tr(
              'Keine Live-Verbindung. Gespeicherte Videos bleiben verfügbar.'
            )}
          </Text>
          <Button label="Neu verbinden" secondary onPress={reconnectAll} />
        </View>
      )}
      {(!!failure || !!notice || !!busy || !!download) && (
        <View style={{ padding: 14, backgroundColor: c.soft, gap: 8 }}>
          {!!failure && (
            <Text
              accessibilityRole="alert"
              style={[ui.body, { color: c.danger }]}
            >
              {failure}
            </Text>
          )}
          {!!notice && (
            <Text style={[ui.body, { color: c.accent }]}>{notice}</Text>
          )}
          {!!busy && !download && (
            <Text style={[ui.body, { color: c.muted }]}>
              {tr('Anfrage läuft …')}
            </Text>
          )}
          {!!download && (
            <>
              <Text style={{ color: c.text }}>
                Download{' '}
                {download.progress < 0
                  ? 'läuft …'
                  : `${Math.round(download.progress * 100)} %`}
              </Text>
              <View
                style={{ height: 5, backgroundColor: c.line, borderRadius: 4 }}
              >
                <View
                  style={{
                    height: 5,
                    width: `${Math.max(2, download.progress * 100)}%`,
                    backgroundColor: c.accent,
                    borderRadius: 4,
                  }}
                />
              </View>
              <Button
                label="Download abbrechen"
                secondary
                onPress={() => {
                  void downloadRef.current?.cancel();
                }}
              />
            </>
          )}
        </View>
      )}

      {tab === 'overview' ? (
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={busy === 'refresh'}
              onRefresh={refresh}
              tintColor={c.accent}
            />
          }
        >
          {active && (
            <View style={[ui.row, { flexWrap: 'wrap' }]}>
              <Button
                label={isResumable(printCode!) ? 'Fortsetzen' : 'Pausieren'}
                icon={isResumable(printCode!) ? 'play' : 'pause'}
                disabled={
                  !connected ||
                  !!busy ||
                  !(isPausable(printCode!) || isResumable(printCode!))
                }
                onPress={() =>
                  command(
                    isResumable(printCode!) ? 131 : 129,
                    isResumable(printCode!) ? 'Fortsetzen' : 'Pausieren'
                  )
                }
              />
              <Button
                label="Abbrechen"
                danger
                icon="stop"
                disabled={!connected || !!busy}
                onPress={() =>
                  Alert.alert(
                    'Druck abbrechen?',
                    'Der aktuelle Druck wird beendet.',
                    [
                      { text: 'Weiterdrucken', style: 'cancel' },
                      {
                        text: 'Abbrechen',
                        style: 'destructive',
                        onPress: () => command(130, 'Druckabbruch'),
                      },
                    ]
                  )
                }
              />
            </View>
          )}
          <LiveCamera
            key={host}
            host={host}
            connected={connected}
            lightOn={!!status?.LightStatus?.SecondLight}
            setLight={async enabled => {
              await requestFeature(printerId, 403, {
                LightStatus: { SecondLight: Number(enabled) },
              });
              await requestFeature(printerId, 0);
            }}
            resolve={async () => {
              const result = await requestFeature(printerId, 386, {
                Enable: 1,
              });
              const uri = mediaUrl(host, result.VideoUrl);
              if (!uri)
                throw new Error('Keine Kamera-Adresse vom Drucker erhalten.');
              return uri;
            }}
          />
          <View style={card}>
            <View style={ui.between}>
              <Text style={[ui.heading, { color: c.text }]}>
                {tr('Temperaturen')}
              </Text>
              <Ionicons name="thermometer-outline" size={21} color={c.muted} />
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[
                {
                  label: 'Düse',
                  temp: status?.TempOfNozzle,
                  target: status?.TempTargetNozzle,
                  key: 'TempTargetNozzle',
                  max: 300,
                },
                {
                  label: 'Druckbett',
                  temp: status?.TempOfHotbed,
                  target: status?.TempTargetHotbed,
                  key: 'TempTargetHotbed',
                  max: 110,
                },
                {
                  label: 'Bauraum',
                  temp: status?.TempOfBox,
                  target: undefined,
                  key: '',
                  max: 0,
                },
              ].map(item => (
                <Pressable
                  key={item.label}
                  disabled={!item.key || !connected || !!busy}
                  onPress={() =>
                    showSetting(item.label, item.key, item.max, item.target)
                  }
                  style={{
                    flex: 1,
                    backgroundColor: c.soft,
                    padding: 12,
                    borderRadius: 15,
                    gap: 9,
                  }}
                >
                  <Text style={{ color: c.muted, fontSize: 12 }}>
                    {tr(item.label)}
                  </Text>
                  <Text
                    style={{ color: c.text, fontSize: 23, fontWeight: '600' }}
                  >
                    {item.temp === undefined
                      ? '—'
                      : `${Math.round(item.temp)}°`}
                  </Text>
                  <Text style={{ color: c.muted, fontSize: 11 }}>
                    {item.key
                      ? `${tr('Ziel')} ${item.target ?? '—'}° · ${tr('Ändern')}`
                      : tr('Sensor')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={card}>
            <Text style={[ui.heading, { color: c.text }]}>
              {tr('Steuerung')}
            </Text>
            <Button
              label={`Druckgeschwindigkeit · ${print?.PrintSpeedPct ?? '—'} %`}
              secondary
              disabled={!connected || !!busy || !active}
              onPress={() =>
                showSetting(
                  'Druckgeschwindigkeit',
                  'PrintSpeedPct',
                  200,
                  print?.PrintSpeedPct
                )
              }
            />

            {(
              [
                { label: 'Modelllüfter', key: 'ModelFan' },
                { label: 'Zusatzlüfter', key: 'AuxiliaryFan' },
                { label: 'Bauraumlüfter', key: 'BoxFan' },
              ] as const
            ).map(fan => (
              <FanSlider
                key={fan.key}
                label={fan.label}
                value={status?.CurrentFanSpeed?.[fan.key] ?? 0}
                disabled={!connected}
                send={value =>
                  requestFeature(printerId, 403, {
                    TargetFanSpeed: { [fan.key]: value },
                  })
                }
              />
            ))}
            <Text style={[ui.body, { color: c.muted }]}>
              {tr(
                'Die Timelapse-Aufnahme stellst du vor dem Start in den Druckoptionen ein.'
              )}
            </Text>
          </View>
          <View style={card}>
            <Text style={[ui.heading, { color: c.text }]}>
              {tr('Druckerinformationen')}
            </Text>
            {[
              ['Modell', printer.deviceAttributes?.MachineName],
              ['Firmware', printer.deviceAttributes?.FirmwareVersion],
              [
                'Freier Speicher',
                typeof printer.deviceAttributes?.RemainingMemory === 'number'
                  ? sizeText(printer.deviceAttributes.RemainingMemory)
                  : undefined,
              ],
            ].map(([label, value]) => (
              <View key={String(label)} style={ui.between}>
                <Text style={{ color: c.muted }}>{tr(String(label))}</Text>
                <Text
                  selectable
                  style={{ color: c.text, flex: 1, textAlign: 'right' }}
                >
                  {value ? String(value) : '—'}
                </Text>
              </View>
            ))}
            <TextInput
              value={newName}
              onChangeText={setNewName}
              maxLength={50}
              placeholder={tr('Neuer Druckername')}
              placeholderTextColor={c.muted}
              style={[ui.input, { color: c.text, borderColor: c.line }]}
            />
            <Button
              label="Am Drucker umbenennen"
              secondary
              disabled={!newName.trim() || !connected || !!busy}
              onPress={() =>
                void run('rename', async () => {
                  await requestFeature(printerId, 192, {
                    Name: newName.trim(),
                  });
                  setNotice('Name am Drucker geändert.');
                  setNewName('');
                  await requestFeature(printerId, 1);
                })
              }
            />
            <Button
              label="Drucker entfernen"
              danger
              icon="unlink-outline"
              onPress={() =>
                Alert.alert(
                  tr('Drucker entfernen?'),
                  tr(
                    'Nur die Verbindung wird aus der App entfernt. Dateien bleiben auf dem Drucker.'
                  ),
                  [
                    { text: tr('Behalten'), style: 'cancel' },
                    {
                      text: tr('Entfernen'),
                      style: 'destructive',
                      onPress: () => {
                        removePrinter(printerId);
                        navigation.goBack();
                      },
                    },
                  ]
                )
              }
            />
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={{ padding: 12, paddingBottom: 8, gap: 6 }}>
            {tab !== 'files' && (
              <View style={ui.between}>
                <Text style={[ui.heading, { color: c.text }]}>
                  {tab === 'history'
                    ? tr('Deine letzten Drucke')
                    : tr('Momente in Bewegung')}
                </Text>
                <Text style={{ color: c.muted }}>
                  {tab === 'history'
                    ? filteredHistory.length
                    : videoTasks.length}
                </Text>
              </View>
            )}
            <SearchField
              value={query}
              onChangeText={setQuery}
              placeholder={
                tab === 'files' ? 'Dateiname suchen …' : 'Druckname suchen …'
              }
            />
            {tab === 'files' && (
              <>
                <View style={ui.between}>
                  <View style={ui.row}>
                    <Button
                      label="Intern"
                      secondary
                      onPress={() => void library.loadFiles('/local')}
                      disabled={!connected || library.filesLoading}
                    />
                    <Button
                      label="USB"
                      secondary
                      onPress={() => void library.loadFiles('/udisk')}
                      disabled={!connected || library.filesLoading}
                    />
                  </View>
                  <Pressable
                    onPress={() => setSort(sort === 'name' ? 'date' : 'name')}
                  >
                    <Text
                      style={{
                        color: c.accent,
                        fontSize: 13,
                        fontWeight: '600',
                      }}
                    >
                      {sort === 'name' ? 'A–Z ↓' : tr('Neueste ↓')}
                    </Text>
                  </Pressable>
                </View>
                {library.folder.split('/').filter(Boolean).length > 1 && (
                  <View style={ui.row}>
                    {library.folder.split('/').filter(Boolean).length > 1 && (
                      <Button
                        label="Zurück"
                        secondary
                        onPress={() =>
                          void library.loadFiles(
                            library.folder.substring(
                              0,
                              library.folder.lastIndexOf('/')
                            )
                          )
                        }
                      />
                    )}
                    <Text style={{ color: c.muted, fontSize: 12, flex: 1 }}>
                      {library.folder}
                    </Text>
                  </View>
                )}
              </>
            )}
            {tab === 'history' && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8 }}
              >
                {['Alle', 'Abgeschlossen', 'Abgebrochen', 'Fehlgeschlagen'].map(
                  filter => (
                    <Pressable
                      key={filter}
                      onPress={() => setHistoryFilter(filter)}
                      style={{
                        backgroundColor:
                          filter === historyFilter ? c.button : c.soft,
                        paddingHorizontal: 12,
                        paddingVertical: 9,
                        borderRadius: 12,
                      }}
                    >
                      <Text
                        style={{
                          color: filter === historyFilter ? c.ink : c.muted,
                          fontSize: 12,
                        }}
                      >
                        {tr(filter)}
                      </Text>
                    </Pressable>
                  )
                )}
              </ScrollView>
            )}
          </View>
          {tab === 'files' ? (
            <FlatList
              data={filteredFiles}
              renderItem={renderFile}
              keyExtractor={file => file.path}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 30,
              }}
              refreshing={library.filesLoading}
              onRefresh={() => void library.loadFiles(library.folder)}
              ListEmptyComponent={
                <EmptyState
                  loading={library.filesLoading}
                  title={
                    library.filesLoading
                      ? 'Dateien werden geladen'
                      : library.filesError
                        ? 'Dateien nicht erreichbar'
                        : query
                          ? 'Keine Treffer'
                          : 'Noch keine Dateien'
                  }
                  text={
                    library.filesError ||
                    (query
                      ? 'Versuche einen anderen Suchbegriff.'
                      : 'G-Code-Dateien auf diesem Speicher erscheinen hier.')
                  }
                  retry={
                    library.filesError
                      ? () => void library.loadFiles(library.folder)
                      : undefined
                  }
                />
              }
            />
          ) : tab === 'history' ? (
            <FlatList
              data={filteredHistory}
              renderItem={renderHistory}
              keyExtractor={task => task.id}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 30,
              }}
              refreshing={library.historyLoading}
              onRefresh={() => void library.loadHistory()}
              ListHeaderComponent={
                library.historyError && library.history.length ? (
                  <Text style={{ color: c.danger }}>
                    {library.historyError}
                  </Text>
                ) : null
              }
              ListEmptyComponent={
                <EmptyState
                  loading={library.historyLoading}
                  title={
                    library.historyLoading
                      ? 'Druckdetails werden geladen'
                      : library.historyError
                        ? 'Verlauf nicht erreichbar'
                        : 'Keine Drucke gefunden'
                  }
                  text={
                    library.historyError ||
                    'Abgeschlossene und abgebrochene Drucke erscheinen hier mit ihren Details.'
                  }
                  retry={
                    library.historyError
                      ? () => void library.loadHistory()
                      : undefined
                  }
                />
              }
            />
          ) : (
            <FlatList
              data={videoTasks}
              renderItem={renderVideo}
              keyExtractor={task => task.id}
              contentContainerStyle={{
                paddingHorizontal: 20,
                paddingBottom: 30,
              }}
              refreshing={library.historyLoading}
              onRefresh={() => void library.loadHistory()}
              ListEmptyComponent={
                <EmptyState
                  icon="film-outline"
                  loading={library.historyLoading}
                  title={
                    library.historyLoading
                      ? 'Timelapses werden geladen'
                      : 'Noch keine Timelapses'
                  }
                  text={
                    library.historyError ||
                    'Aktiviere „Timelapse aufnehmen“ im Druckdialog. Fertige Videos kannst du hier ansehen und offline speichern.'
                  }
                  retry={
                    library.historyError
                      ? () => void library.loadHistory()
                      : undefined
                  }
                />
              }
            />
          )}
        </>
      )}

      {!!selectedFile && (
        <PrintOptions
          file={selectedFile}
          thumbnail={thumb(selectedFile)}
          platform={status?.PlatFormType ?? 0}
          allowed={ready}
          onClose={() => setSelectedFile(undefined)}
          onStart={async payload => {
            const latest = await requestFeature(printerId, 0);
            if (![0, 8, 9].includes(latest.PrintInfo?.Status))
              throw new Error(
                'Der Drucker ist inzwischen beschäftigt. Bitte den aktuellen Druck prüfen.'
              );
            await requestFeature(printerId, 128, payload);
            setNotice('Druckauftrag bestätigt.');
            setTab('overview');
          }}
        />
      )}
      <Modal
        visible={!!selectedTask}
        animationType="slide"
        onRequestClose={() => setSelectedTask(undefined)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <ScrollView contentContainerStyle={{ padding: 22, gap: 20 }}>
            {selectedTask && (
              <>
                <View style={ui.between}>
                  <Text style={[ui.title, { color: c.text }]}>
                    {tr('Druckdetails')}
                  </Text>
                  <Button
                    label="Schließen"
                    secondary
                    onPress={() => setSelectedTask(undefined)}
                  />
                </View>
                <Thumb large uri={mediaUrl(host, selectedTask.thumbnail)} />
                <Text selectable style={[ui.heading, { color: c.text }]}>
                  {selectedTask.name}
                </Text>
                <Badge
                  text={selectedTask.status}
                  good={selectedTask.status === 'Abgeschlossen'}
                />
                <View style={card}>
                  {[
                    ['Gestartet', dateText(selectedTask.startedAt)],
                    ['Druckdauer', durationText(selectedTask.duration)],
                    [
                      'Schichten',
                      `${selectedTask.printedLayers ?? '—'} / ${selectedTask.layers ?? '—'}`,
                    ],
                    ['Filament', selectedTask.filament || 'Nicht gemeldet'],
                    ['Timelapse', videoStatusText(selectedTask.videoStatus)],
                  ].map(([label, value]) => (
                    <View key={label} style={ui.between}>
                      <Text style={{ color: c.muted }}>{tr(label)}</Text>
                      <Text
                        style={{ color: c.text, flex: 1, textAlign: 'right' }}
                      >
                        {value}
                      </Text>
                    </View>
                  ))}
                </View>
                {(selectedTask.videoStatus === 1 ||
                  localVideo(selectedTask)) && (
                  <Button
                    label="Zur Timelapse"
                    icon="film-outline"
                    onPress={() => {
                      setSelectedTask(undefined);
                      changeTab('videos');
                      setQuery(selectedTask.name);
                    }}
                  />
                )}
                <Button
                  label="Erneut drucken"
                  icon="print-outline"
                  secondary
                  disabled={!connected || !!busy}
                  onPress={() =>
                    void run('reprint', async () => {
                      const path = selectedTask.path.startsWith('/')
                        ? selectedTask.path
                        : `/local/${selectedTask.path}`;
                      const folder =
                        path.substring(0, path.lastIndexOf('/')) || '/local';
                      const { parseFiles } = await import('../utils/sdcp');
                      const candidates = parseFiles(
                        await requestFeature(printerId, 258, { Url: folder }),
                        folder
                      );
                      const file = candidates.find(item => item.path === path);
                      if (!file) {
                        Alert.alert(
                          tr('Datei nicht mehr vorhanden'),
                          tr(
                            'Die Originaldatei muss zuerst wieder auf den Drucker übertragen werden.'
                          )
                        );
                        return;
                      }
                      setSelectedTask(undefined);
                      setSelectedFile(file);
                    })
                  }
                />
                {busy === 'reprint' && (
                  <Text style={{ color: c.muted }}>
                    {tr('Originaldatei wird geprüft …')}
                  </Text>
                )}
                {!!failure && (
                  <Text style={{ color: c.danger }}>{failure}</Text>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!video}
        animationType="slide"
        onRequestClose={() => setVideo(undefined)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
          <ScrollView contentContainerStyle={{ padding: 22, gap: 20 }}>
            {video && (
              <>
                <View style={ui.between}>
                  <Text style={[ui.title, { color: c.text }]}>Timelapse</Text>
                  <Button
                    label="Schließen"
                    secondary
                    onPress={() => setVideo(undefined)}
                  />
                </View>
                <TimelapsePlayer key={video.uri} uri={video.uri} />
                <Text style={[ui.heading, { color: c.text }]}>
                  {video.task.name}
                </Text>
                <Text style={[ui.body, { color: c.muted }]}>
                  {dateText(video.task.startedAt)}
                </Text>
                <Text style={[ui.body, { color: c.muted }]}>
                  {tr(
                    'Wiedergabe und Vollbild steuerst du direkt im Videoplayer.'
                  )}
                </Text>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!camera}
        animationType="slide"
        onRequestClose={() => setCamera(undefined)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: c.bg, padding: 20, gap: 16 }}
        >
          <View style={ui.between}>
            <Text style={[ui.title, { color: c.text }]}>
              {tr('Live-Kamera')}
            </Text>
            <Button
              label="Schließen"
              secondary
              onPress={() => setCamera(undefined)}
            />
          </View>
          {camera && (
            <WebView
              source={{ uri: camera }}
              style={{ flex: 1, backgroundColor: '#08110E' }}
              javaScriptEnabled={false}
              scalesPageToFit
              allowsFullscreenVideo
              onError={() =>
                setCameraError(
                  'Kamera nicht erreichbar. Bitte schließen und erneut öffnen.'
                )
              }
              onHttpError={() =>
                setCameraError('Die Kamera hat einen Fehler gemeldet.')
              }
            />
          )}
          {!!cameraError && (
            <Text style={{ color: c.danger }}>{cameraError}</Text>
          )}
        </SafeAreaView>
      </Modal>
      <Modal
        visible={!!setting}
        animationType="slide"
        transparent
        onRequestClose={() => setSetting(undefined)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#00000088',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <View style={card}>
            {setting && (
              <>
                <Text style={[ui.heading, { color: c.text }]}>
                  {tr(setting.label)}
                </Text>
                <Text style={[ui.body, { color: c.muted }]}>
                  Zielwert von {setting.key === 'PrintSpeedPct' ? 10 : 0} bis{' '}
                  {setting.max}{' '}
                  {setting.fan || setting.key === 'PrintSpeedPct' ? '%' : '°C'}
                  {setting.fan || setting.key === 'PrintSpeedPct'
                    ? ''
                    : '. 0 schaltet die Heizung aus.'}
                </Text>
                <TextInput
                  accessibilityLabel={tr('Zielwert')}
                  value={setting.value}
                  onChangeText={value => setSetting({ ...setting, value })}
                  keyboardType="number-pad"
                  style={[ui.input, { color: c.text, borderColor: c.line }]}
                />
                <Button
                  label="Übernehmen"
                  disabled={!!busy || !connected}
                  onPress={() => {
                    const value = Number(setting.value);
                    if (
                      !/^\d+$/.test(setting.value) ||
                      value < (setting.key === 'PrintSpeedPct' ? 10 : 0) ||
                      value > setting.max
                    ) {
                      Alert.alert(
                        tr('Ungültiger Wert'),
                        `Bitte eine ganze Zahl von ${setting.key === 'PrintSpeedPct' ? 10 : 0} bis ${setting.max} eingeben.`
                      );
                      return;
                    }
                    void run('setting', async () => {
                      await requestFeature(
                        printerId,
                        403,
                        setting.fan
                          ? { TargetFanSpeed: { [setting.key]: value } }
                          : { [setting.key]: value }
                      );
                      setSetting(undefined);
                      setNotice('Einstellung bestätigt.');
                    });
                  }}
                />
                <Button
                  label="Zurück"
                  secondary
                  onPress={() => setSetting(undefined)}
                />
                {!!failure && (
                  <Text style={{ color: c.danger }}>{failure}</Text>
                )}
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
