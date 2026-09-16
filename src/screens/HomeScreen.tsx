import React from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { usePrinterConnections } from '../contexts/PrinterConnectionsContext';
import {
  Badge,
  Button,
  EmptyState,
  ui,
  usePalette,
} from '../components/StudioUI';
import { basename, statusText } from '../utils/sdcp';
import { isStoppable } from '../types';

export function HomeScreen({ navigation }: any) {
  const c = usePalette();
  const { printers, reconnectAll } = usePrinterConnections();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 24, flexGrow: 1 }}>
        <View style={ui.between}>
          <Text style={[ui.label, { color: c.accent }]}>CC TOOL / STUDIO</Text>
          <Pressable
            accessibilityLabel="Einstellungen"
            onPress={() => navigation.navigate('Settings')}
            hitSlop={16}
          >
            <Ionicons name="settings-outline" color={c.text} size={24} />
          </Pressable>
        </View>
        <View style={{ gap: 9 }}>
          <Text style={[ui.title, { fontSize: 36, color: c.text }]}>
            Deine Werkstatt.
          </Text>
          <Text style={[ui.body, { color: c.muted }]}>
            Alles für deinen nächsten Druck. Direkt im WLAN.
          </Text>
        </View>
        <View
          style={{
            borderRadius: 26,
            backgroundColor: c.button,
            padding: 24,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 15,
          }}
        >
          <View style={{ flex: 1, gap: 10 }}>
            <Text style={[ui.label, { color: c.ink, opacity: 0.7 }]}>
              CENTAURI CARBON
            </Text>
            <Text
              style={{
                color: c.ink,
                fontSize: 23,
                fontWeight: '600',
                lineHeight: 30,
              }}
            >
              Von der Datei{'\n'}zum fertigen Druck.
            </Text>
            <Text style={{ color: c.ink, fontSize: 12, opacity: 0.8 }}>
              Dateien · Drucke · Timelapses
            </Text>
          </View>
          <Image
            source={require('../../assets/CC.png')}
            style={{ width: 100, height: 115 }}
            resizeMode="contain"
          />
        </View>
        <View style={ui.between}>
          <Text style={[ui.heading, { color: c.text }]}>Deine Drucker</Text>
          <Pressable
            accessibilityLabel="Drucker neu verbinden"
            onPress={reconnectAll}
            hitSlop={14}
          >
            <Ionicons name="refresh" color={c.accent} size={21} />
          </Pressable>
        </View>
        {printers.map(printer => (
          <Pressable
            accessibilityRole="button"
            key={printer.id}
            onPress={() =>
              navigation.navigate('PrinterDetails', { printerId: printer.id })
            }
            style={[ui.card, { backgroundColor: c.card, borderColor: c.line }]}
          >
            <View style={ui.between}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={[ui.heading, { color: c.text }]}>
                  {printer.printerName}
                </Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  {printer.ipAddress}
                </Text>
              </View>
              <Ionicons name="arrow-forward" color={c.accent} size={23} />
            </View>
            <View style={ui.between}>
              <Badge
                text={
                  printer.connectionStatus === 'connected'
                    ? statusText(printer.status?.PrintInfo?.Status)
                    : printer.connectionStatus === 'connecting'
                      ? 'Verbindet …'
                      : 'Offline'
                }
                good={printer.connectionStatus === 'connected'}
              />
              <Text style={{ color: c.muted, fontSize: 12 }}>
                {`Bauraum ${printer.status?.TempOfBox === undefined ? '—' : Math.round(printer.status.TempOfBox)}°`}
              </Text>
            </View>
            {!!printer.status?.PrintInfo?.Filename && (
              <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={2}>
                {basename(printer.status.PrintInfo.Filename)}
              </Text>
            )}
            {isStoppable(printer.status?.PrintInfo?.Status ?? 0) && (
              <View style={{ gap: 7 }}>
                <Text style={{ color: c.accent, fontSize: 12 }}>
                  {Math.round(printer.status?.PrintInfo?.Progress || 0)} %
                </Text>
                <View
                  style={{
                    height: 6,
                    borderRadius: 4,
                    backgroundColor: c.line,
                  }}
                >
                  <View
                    style={{
                      height: 6,
                      borderRadius: 4,
                      backgroundColor: c.accent,
                      width: `${Math.max(0, Math.min(100, printer.status?.PrintInfo?.Progress || 0))}%`,
                    }}
                  />
                </View>
              </View>
            )}
          </Pressable>
        ))}
        {printers.length === 0 && (
          <EmptyState
            icon="print-outline"
            title="Dein Drucker fehlt noch"
            text="Verbinde deinen Centauri Carbon über seine IP-Adresse. Dein Handy und Drucker müssen im selben Netzwerk sein."
          />
        )}
        <Button
          label="Drucker hinzufügen"
          icon="add"
          onPress={() => navigation.navigate('AddEditPrinter')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
