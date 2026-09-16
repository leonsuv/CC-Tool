import React from 'react';
import { Linking, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, ui, usePalette } from '../components/StudioUI';
import { useTheme } from '../contexts/ThemeContext';
import { languages, tr, useLanguage } from '../i18n';
export function SettingsScreen({ navigation }: any) {
  const c = usePalette();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 22 }}>
        <Button
          label="Zurück"
          secondary
          icon="arrow-back"
          onPress={() => navigation.goBack()}
        />
        <Text style={[ui.title, { color: c.text }]}>{tr('Einstellungen')}</Text>
        <View
          style={[ui.card, { backgroundColor: c.card, borderColor: c.line }]}
        >
          <Text style={[ui.heading, { color: c.text }]}>
            {tr('Darstellung')}
          </Text>
          {(['system', 'light', 'dark'] as const).map(value => (
            <Button
              key={value}
              label={
                {
                  system: tr('Systemeinstellung'),
                  light: tr('Hell'),
                  dark: tr('Dunkel'),
                }[value]
              }
              secondary={theme !== value}
              icon={theme === value ? 'checkmark' : undefined}
              onPress={() => setTheme(value)}
            />
          ))}
        </View>
        <View
          style={[ui.card, { backgroundColor: c.card, borderColor: c.line }]}
        >
          <Text style={[ui.heading, { color: c.text }]}>{tr('Sprache')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {languages.map(item => (
              <View key={item.code} style={{ minWidth: '47%', flexGrow: 1 }}>
                <Button
                  label={item.name}
                  secondary={language !== item.code}
                  icon={language === item.code ? 'checkmark' : undefined}
                  onPress={() => void setLanguage(item.code)}
                />
              </View>
            ))}
          </View>
        </View>
        <View
          style={[ui.card, { backgroundColor: c.card, borderColor: c.line }]}
        >
          <Text style={[ui.heading, { color: c.text }]}>
            {tr('Lokal verbunden')}
          </Text>
          <Text style={[ui.body, { color: c.muted }]}>
            {tr(
              'Die App verbindet sich direkt mit deinem Drucker im WLAN. Heruntergeladene Timelapses bleiben im App-Speicher und können über „Teilen“ exportiert werden. Beim Deinstallieren werden diese lokalen Kopien entfernt.'
            )}
          </Text>
        </View>
        <Text style={[ui.heading, { color: c.text }]}>
          CC Tool Studio · 2.2.0
        </Text>
        <Text style={[ui.body, { color: c.muted }]}>
          {tr('Weiterentwicklung von CC-Tool (MIT). Protokollreferenzen:')}{' '}
          WalkerFrederick/sdcp-centauri-carbon, RemmyLee/carbon, CBD-Tech SDCP
          und Centauri-Carbon-Manager.
        </Text>
        <Button
          label="CC-Tool Quellprojekt & Lizenz"
          secondary
          onPress={() => {
            void Linking.openURL(
              'https://github.com/WalkerFrederick/CC-Tool'
            ).catch(() => {});
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
