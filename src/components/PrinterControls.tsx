import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Button, ui, usePalette } from './StudioUI';

export function LiveCamera({
  host,
  connected,
  resolve,
}: {
  host: string;
  connected: boolean;
  resolve: () => Promise<string>;
}) {
  const c = usePalette();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active'
  );
  const [uri, setUri] = useState<string>();
  const [error, setError] = useState('');
  const [full, setFull] = useState(false);
  useEffect(() => {
    void ScreenOrientation.lockAsync(
      full
        ? ScreenOrientation.OrientationLock.DEFAULT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => setError('Bildschirmdrehung konnte nicht aktiviert werden.'));
    return () => {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => {});
    };
  }, [full]);
  const resolver = useRef(resolve);
  resolver.current = resolve;
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(`camera-${host}`)
      .then(value => {
        if (live) {
          setEnabled(value !== 'off');
          setLoaded(true);
        }
      })
      .catch(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [host]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state =>
      setForeground(state === 'active')
    );
    return () => sub.remove();
  }, []);
  useEffect(() => {
    let live = true;
    setUri(undefined);
    setError('');
    if (loaded && enabled && connected && foreground)
      void resolver
        .current()
        .then(value => {
          if (live) setUri(value);
        })
        .catch(e => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [loaded, enabled, connected, foreground]);
  const stream = () =>
    uri && (
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: '#08110E' }}
        originWhitelist={['http://*', 'https://*']}
        onError={() =>
          setError(
            'Kamera nicht erreichbar. Aus- und Einschalten versucht es erneut.'
          )
        }
      />
    );
  return (
    <View style={[ui.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <View style={ui.between}>
        <Text style={[ui.heading, { color: c.text }]}>Live-Kamera</Text>
        <Switch
          accessibilityLabel="Live-Kamera aktivieren"
          value={enabled}
          onValueChange={value => {
            setEnabled(value);
            setFull(false);
            void AsyncStorage.setItem(
              `camera-${host}`,
              value ? 'on' : 'off'
            ).catch(() => {});
          }}
          trackColor={{ true: c.accent }}
        />
      </View>
      {!enabled ? (
        <Text style={[ui.body, { color: c.muted }]}>
          Kamera aus · spart Bandbreite. Die Steuerung bleibt verfügbar.
        </Text>
      ) : !connected ? (
        <Text style={{ color: c.muted }}>Drucker offline</Text>
      ) : !uri ? (
        <Text style={{ color: c.muted }}>Kamera wird verbunden …</Text>
      ) : (
        <>
          {!full && foreground && (
            <View
              style={{
                aspectRatio: 16 / 9,
                overflow: 'hidden',
                borderRadius: 12,
              }}
            >
              {stream()}
            </View>
          )}
          <Button
            label="Vollbild"
            secondary
            icon="expand-outline"
            onPress={() => setFull(true)}
          />
        </>
      )}
      {!!error && <Text style={{ color: c.danger }}>{error}</Text>}
      <Modal
        visible={full && enabled && connected && foreground}
        onRequestClose={() => setFull(false)}
        supportedOrientations={['portrait', 'landscape']}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: '#08110E', padding: 12, gap: 12 }}
        >
          <Button label="Vollbild schließen" onPress={() => setFull(false)} />
          {full && foreground && stream()}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

export function FanSlider({
  label,
  value,
  disabled,
  send,
}: {
  label: string;
  value: number;
  disabled: boolean;
  send: (value: number) => Promise<unknown>;
}) {
  const c = usePalette();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const pending = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const dragging = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sender = useRef(send);
  sender.current = send;
  useEffect(() => {
    if (!dragging.current && !inFlight.current) setDraft(value);
  }, [value]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      pending.current = undefined;
    };
  }, []);
  const flush = async () => {
    if (!mounted.current || inFlight.current || pending.current === undefined)
      return;
    const next = pending.current;
    pending.current = undefined;
    inFlight.current = true;
    try {
      await sender.current(next);
      if (mounted.current) setError('');
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      inFlight.current = false;
      if (mounted.current && pending.current !== undefined) void flush();
    }
  };
  const change = (next: number, immediate = false) => {
    next = Math.round(next);
    setDraft(next);
    pending.current = next;
    if (immediate) {
      clearTimeout(timer.current);
      timer.current = undefined;
      void flush();
    } else if (!timer.current)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        void flush();
      }, 250);
  };
  return (
    <View style={{ gap: 5 }}>
      <View style={ui.between}>
        <Text style={{ color: c.text }}>{label}</Text>
        <Text style={{ color: c.accent }}>{draft} %</Text>
      </View>
      <Slider
        accessibilityLabel={label}
        minimumValue={0}
        maximumValue={100}
        step={1}
        value={draft}
        disabled={disabled}
        minimumTrackTintColor={c.accent}
        maximumTrackTintColor={c.line}
        thumbTintColor={c.accent}
        onSlidingStart={() => {
          dragging.current = true;
        }}
        onValueChange={next => change(next)}
        onSlidingComplete={next => {
          dragging.current = false;
          change(next, true);
        }}
      />
      {!!error && <Text style={{ color: c.danger }}>{error}</Text>}
    </View>
  );
}
