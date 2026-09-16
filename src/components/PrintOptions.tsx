import React, { useState } from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { PrinterFile } from '../types';
import { Button, Thumb, ui, usePalette } from './StudioUI';
import { durationText, printPayload, sizeText } from '../utils/sdcp';
import type { Payload } from '../utils/sdcp';
import { tr } from '../i18n';

export function PrintOptions({
  file,
  thumbnail,
  platform,
  allowed,
  onClose,
  onStart,
}: {
  file: PrinterFile;
  thumbnail?: string;
  platform: number;
  allowed: boolean;
  onClose: () => void;
  onStart: (payload: Payload) => Promise<void>;
}) {
  const c = usePalette();
  const [calibration, setCalibration] = useState(false);
  const [timelapse, setTimelapse] = useState(true);
  const [layer, setLayer] = useState('0');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      const payload = printPayload(
        file,
        layer,
        calibration,
        timelapse,
        platform
      );
      setBusy(true);
      await onStart(payload);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const confirm = () => {
    try {
      printPayload(file, layer, calibration, timelapse, platform);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    Alert.alert(
      tr('Druck starten?'),
      `${file.name}\n\n${tr('Druckbett frei und Filament eingelegt?')}${Number(layer) > 0 ? `\n${tr('Fortsetzen')} · ${tr('Startschicht')} ${layer}` : ''}`,
      [
        { text: tr('Zurück'), style: 'cancel' },
        { text: tr('Druck starten'), onPress: () => void submit() },
      ]
    );
  };
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => !busy && onClose()}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={[ui.between, { padding: 20 }]}>
          <Text style={[ui.heading, { color: c.text, flex: 1 }]}>
            {tr('Druck vorbereiten')}
          </Text>
          <Button
            label="Schließen"
            secondary
            disabled={busy}
            onPress={onClose}
          />
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 22, paddingTop: 0, gap: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {!!thumbnail && <Thumb uri={thumbnail} large />}
          <View style={{ gap: 6 }}>
            <Text selectable style={[ui.heading, { color: c.text }]}>
              {file.name}
            </Text>
            <Text selectable style={[ui.body, { color: c.muted }]}>
              {file.path}
            </Text>
          </View>
          <View style={[ui.row, { justifyContent: 'space-between' }]}>
            {[
              ['DATEIGRÖSSE', sizeText(file.size)],
              ['SCHICHTEN', file.layers ?? '—'],
              ['DRUCKZEIT', durationText(file.duration)],
            ].map(([label, value]) => (
              <View key={label} style={{ gap: 7 }}>
                <Text style={[ui.label, { color: c.muted }]}>
                  {tr(String(label))}
                </Text>
                <Text style={{ color: c.text, fontWeight: '600' }}>
                  {value}
                </Text>
              </View>
            ))}
          </View>
          <View
            style={[ui.card, { backgroundColor: c.card, borderColor: c.line }]}
          >
            <Text style={[ui.heading, { color: c.text }]}>
              {tr('Druckoptionen')}
            </Text>
            {[
              {
                label: 'Automatische Nivellierung',
                hint: 'Druckbett vor dem Start vermessen.',
                value: calibration,
                change: setCalibration,
              },
              {
                label: 'Timelapse aufnehmen',
                hint: 'Nach dem Druck unter Timelapses ansehen.',
                value: timelapse,
                change: setTimelapse,
              },
            ].map(option => (
              <View
                key={option.label}
                style={[ui.between, { paddingVertical: 8 }]}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text
                    style={{ color: c.text, fontWeight: '600', fontSize: 15 }}
                  >
                    {tr(option.label)}
                  </Text>
                  <Text style={[ui.body, { color: c.muted }]}>
                    {tr(option.hint)}
                  </Text>
                </View>
                <Switch
                  value={option.value}
                  onValueChange={option.change}
                  disabled={busy}
                  trackColor={{ true: c.accent }}
                />
              </View>
            ))}
            <View style={{ gap: 6 }}>
              <Text style={{ color: c.text, fontWeight: '600' }}>
                {tr('Startschicht')}
              </Text>
              <Text style={[ui.body, { color: c.muted }]}>
                {tr(
                  '0 startet den vollständigen Druck. Andere Werte sind für die gezielte Wiederaufnahme.'
                )}
              </Text>
              <TextInput
                accessibilityLabel={tr('Startschicht')}
                value={layer}
                onChangeText={setLayer}
                keyboardType="number-pad"
                editable={!busy}
                style={[
                  ui.input,
                  { color: c.text, borderColor: c.line, backgroundColor: c.bg },
                ]}
              />
            </View>
            <Text style={[ui.body, { color: c.muted }]}>
              {tr('Druckplatte: aktuelle Druckereinstellung wird übernommen.')}
            </Text>
          </View>
          {!allowed && (
            <Text style={[ui.body, { color: c.danger }]}>
              {tr(
                'Ein neuer Druck ist erst möglich, wenn der Drucker verbunden und bereit ist.'
              )}
            </Text>
          )}
          {!!error && (
            <Text
              accessibilityRole="alert"
              style={[ui.body, { color: c.danger }]}
            >
              {error}
            </Text>
          )}
        </ScrollView>
        <View
          style={{
            padding: 20,
            borderTopWidth: 1,
            borderColor: c.line,
            backgroundColor: c.card,
          }}
        >
          <Button
            label={busy ? 'Warte auf Bestätigung …' : 'Druck starten'}
            icon="print-outline"
            onPress={confirm}
            busy={busy}
            disabled={!allowed}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
