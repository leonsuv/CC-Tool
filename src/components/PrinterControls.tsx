import React, { useEffect, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { WebView } from 'react-native-webview';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { cameraDocument } from '../utils/camera';
import { Button, ui, usePalette } from './StudioUI';

export function LiveCamera({
  host,
  connected,
  resolve,
  lightOn,
  setLight,
}: {
  host: string;
  connected: boolean;
  resolve: () => Promise<string>;
  lightOn: boolean;
  setLight: (enabled: boolean) => Promise<unknown>;
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
  const [presentationReady, setPresentationReady] = useState(false);
  const insets = useSafeAreaInsets();
  const [lightBusy, setLightBusy] = useState(false);
  const lightLock = useRef(false);
  const [lightError, setLightError] = useState('');
  const fullscreen = full && enabled && connected && foreground;
  const toggleLight = async (next: boolean) => {
    if (lightLock.current || !connected) return;
    lightLock.current = true;
    setLightBusy(true);
    setLightError('');
    try {
      await setLight(next);
    } catch (e) {
      setLightError((e as Error).message);
    } finally {
      lightLock.current = false;
      setLightBusy(false);
    }
  };
  useEffect(() => {
    if (!fullscreen) {
      setPresentationReady(false);
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let previous: 'visible' | 'hidden' = 'visible';
    void NavigationBar.getVisibilityAsync()
      .then(value => {
        previous = value;
        if (active) return NavigationBar.setVisibilityAsync('hidden');
      })
      .catch(() => {})
      .finally(() => {
        // Android dialogs copy the activity's system-bar state when shown.
        // Give its insets a frame to update before creating the fullscreen window.
        if (active)
          timer = setTimeout(() => {
            if (active) setPresentationReady(true);
          }, 100);
      });
    return () => {
      active = false;
      clearTimeout(timer);
      void NavigationBar.setVisibilityAsync(previous).catch(() => {});
    };
  }, [fullscreen]);
  useEffect(() => {
    void ScreenOrientation.lockAsync(
      fullscreen
        ? ScreenOrientation.OrientationLock.DEFAULT
        : ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => setError('Bildschirmdrehung konnte nicht aktiviert werden.'));
    return () => {
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP
      ).catch(() => {});
    };
  }, [fullscreen]);
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
        source={{ html: cameraDocument(uri), baseUrl: uri }}
        style={{ flex: 1, backgroundColor: '#08110E' }}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        onMessage={() =>
          setError('Kamera nicht erreichbar. Bitte erneut einschalten.')
        }
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
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                {stream()}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Kamerabild im Vollbild öffnen"
                onPress={() => setFull(true)}
                style={StyleSheet.absoluteFill}
              />
            </View>
          )}
        </>
      )}
      <View style={ui.between}>
        <Text style={{ color: c.text }}>Bauraumbeleuchtung</Text>
        <Switch
          accessibilityLabel="Bauraumbeleuchtung"
          value={lightOn}
          disabled={!connected || lightBusy}
          trackColor={{ true: c.accent }}
          onValueChange={next => void toggleLight(next)}
        />
      </View>
      {enabled && connected && !!uri && (
        <Button
          label="Vollbild"
          secondary
          icon="expand-outline"
          onPress={() => setFull(true)}
        />
      )}
      {!!lightError && <Text style={{ color: c.danger }}>{lightError}</Text>}
      {!!error && <Text style={{ color: c.danger }}>{error}</Text>}
      {fullscreen && <StatusBar hidden />}
      <Modal
        visible={fullscreen && presentationReady}
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setFull(false)}
        supportedOrientations={['portrait', 'landscape']}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          {fullscreen && stream()}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Vollbild schließen"
            onPress={() => setFull(false)}
            style={{
              position: 'absolute',
              top: Math.max(12, insets.top),
              left: Math.max(12, insets.left),
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#00000066',
            }}
          >
            <Ionicons name="close" size={26} color="#FFFFFF" />
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{
              checked: lightOn,
              disabled: !connected || lightBusy,
            }}
            accessibilityLabel="Bauraumbeleuchtung"
            disabled={!connected || lightBusy}
            onPress={() => void toggleLight(!lightOn)}
            style={{
              position: 'absolute',
              top: Math.max(12, insets.top),
              right: Math.max(12, insets.right),
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: lightOn ? c.button : '#00000044',
              borderWidth: 1,
              borderColor: lightOn ? c.button : '#FFFFFF66',
              opacity: lightBusy ? 0.5 : 1,
            }}
          >
            <Ionicons
              name={lightOn ? 'bulb' : 'bulb-outline'}
              size={23}
              color={lightOn ? c.ink : '#FFFFFF'}
            />
          </Pressable>
          {!!(lightError || error) && (
            <Text
              style={{
                position: 'absolute',
                bottom: Math.max(12, insets.bottom),
                left: 16,
                right: 16,
                color: '#FFFFFF',
                backgroundColor: '#00000099',
                padding: 8,
              }}
            >
              {lightError || error}
            </Text>
          )}
        </View>
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
      <View
        style={{
          height: 48,
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: c.soft,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: `${draft}%`,
            borderRadius: 24,
            backgroundColor: c.accent,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: `${draft}%`,
            marginLeft: draft > 95 ? -13 : draft < 5 ? 9 : -2,
            top: 13,
            height: 22,
            width: 4,
            borderRadius: 2,
            backgroundColor: draft > 5 ? c.ink : c.accent,
          }}
        />
        <Slider
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 48,
          }}
          accessibilityLabel={label}
          minimumValue={0}
          maximumValue={100}
          step={1}
          value={draft}
          disabled={disabled}
          minimumTrackTintColor="transparent"
          maximumTrackTintColor="transparent"
          thumbTintColor="transparent"
          onSlidingStart={() => {
            dragging.current = true;
          }}
          onValueChange={next => change(next)}
          onSlidingComplete={next => {
            dragging.current = false;
            change(next, true);
          }}
        />
      </View>
      {!!error && <Text style={{ color: c.danger }}>{error}</Text>}
    </View>
  );
}
