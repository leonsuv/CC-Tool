import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { usePrinterConnections } from '../contexts/PrinterConnectionsContext';
import { Button, ui, usePalette } from '../components/StudioUI';
import { checkLocalNetworkPermission } from '../utils/LocalNetworkUtils';
import { tr } from '../i18n';
export function AddEditPrinterScreen({ navigation }: any) {
  const c = usePalette();
  const { addPrinter } = usePrinterConnections();
  const [name, setName] = useState('Centauri Carbon');
  const [host, setHost] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 22 }}
        keyboardShouldPersistTaps="handled"
      >
        <Button
          label="Zurück"
          secondary
          icon="arrow-back"
          onPress={() => navigation.goBack()}
        />
        <Text style={[ui.title, { color: c.text }]}>
          {tr('Drucker verbinden')}
        </Text>
        <Text style={[ui.body, { color: c.muted }]}>
          {tr(
            'Dein Centauri Carbon und dein Handy müssen im selben WLAN sein.'
          )}
        </Text>
        <View
          style={[ui.card, { backgroundColor: c.card, borderColor: c.line }]}
        >
          <Text style={{ color: c.text, fontWeight: '600' }}>
            {tr('Name in der App')}
          </Text>
          <TextInput
            accessibilityLabel={tr('Druckername')}
            value={name}
            onChangeText={setName}
            maxLength={50}
            style={[ui.input, { borderColor: c.line, color: c.text }]}
          />
          <Text style={{ color: c.text, fontWeight: '600' }}>
            IP-Adresse oder Hostname
          </Text>
          <TextInput
            accessibilityLabel={tr('IP-Adresse')}
            placeholder="192.168.1.100"
            placeholderTextColor={c.muted}
            autoCapitalize="none"
            autoCorrect={false}
            value={host}
            onChangeText={setHost}
            style={[ui.input, { borderColor: c.line, color: c.text }]}
          />
          <Text style={[ui.body, { color: c.muted }]}>
            {tr(
              'Die IP-Adresse findest du am Drucker unter Einstellungen → Netzwerk. Bei Bedarf kannst du einen Port ergänzen, zum Beispiel :3030.'
            )}
          </Text>
        </View>
        {!!error && <Text style={[ui.body, { color: c.danger }]}>{error}</Text>}
        <Button
          label="Verbinden"
          icon="link-outline"
          busy={busy}
          disabled={!name.trim() || !host.trim()}
          onPress={() => {
            void (async () => {
              setBusy(true);
              setError('');
              try {
                if (!(await checkLocalNetworkPermission())) return;
                addPrinter(name, host);
                navigation.goBack();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
