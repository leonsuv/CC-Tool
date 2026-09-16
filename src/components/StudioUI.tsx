import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../contexts/ThemeContext';
import { tr } from '../i18n';

export function usePalette() {
  const { colorScheme } = useTheme();
  return colorScheme === 'dark'
    ? {
        bg: '#101918',
        card: '#182522',
        soft: '#20322E',
        text: '#F0F5F2',
        muted: '#A0B7AF',
        line: '#2E433D',
        accent: '#74D9AF',
        button: '#95EDC7',
        ink: '#12362A',
        danger: '#FF9292',
      }
    : {
        bg: '#F4F6F2',
        card: '#FFFFFF',
        soft: '#EAF0E9',
        text: '#182D25',
        muted: '#64786F',
        line: '#DEE5DD',
        accent: '#257553',
        button: '#245B43',
        ink: '#FFFFFF',
        danger: '#B13D37',
      };
}
export const ui = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  card: { borderRadius: 22, padding: 20, gap: 14, borderWidth: 1 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.7 },
  heading: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.6 },
  body: { fontSize: 14, lineHeight: 21 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    minHeight: 48,
  },
});
export function Button({
  label,
  onPress,
  icon,
  disabled = false,
  busy = false,
  secondary = false,
  danger = false,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  busy?: boolean;
  secondary?: boolean;
  danger?: boolean;
}) {
  const c = usePalette();
  const color = danger ? c.danger : secondary ? c.text : c.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tr(label)}
      disabled={disabled || busy}
      onPress={onPress}
      android_ripple={{ color: '#88888833' }}
      style={{
        minHeight: 48,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: danger || secondary ? c.soft : c.button,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {busy ? (
        <ActivityIndicator color={color} size="small" />
      ) : icon ? (
        <Ionicons name={icon} size={18} color={color} />
      ) : null}
      <Text style={{ color, fontSize: 14, fontWeight: '700' }}>
        {tr(label)}
      </Text>
    </Pressable>
  );
}
export function Thumb({
  uri,
  alternatives = [],
  large = false,
  video = false,
}: {
  uri?: string;
  alternatives?: string[];
  large?: boolean;
  video?: boolean;
}) {
  const c = usePalette();
  const sources = [
    ...new Set([uri, ...alternatives].filter(Boolean)),
  ] as string[];
  const sourceKey = sources.join('|');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [sourceKey]);
  const currentUri = sources[attempt];
  return (
    <View
      style={{
        width: large ? '100%' : 72,
        height: large ? 175 : 72,
        borderRadius: large ? 18 : 16,
        backgroundColor: c.soft,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {currentUri ? (
        <Image
          key={currentUri}
          source={{ uri: currentUri }}
          resizeMode="contain"
          style={{ width: '100%', height: '100%' }}
          onError={() => setAttempt(index => index + 1)}
        />
      ) : (
        <Ionicons
          name={video ? 'videocam-outline' : 'cube-outline'}
          size={large ? 52 : 30}
          color={c.muted}
        />
      )}
    </View>
  );
}
export function Badge({
  text,
  good = false,
}: {
  text: string;
  good?: boolean;
}) {
  const c = usePalette();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        borderRadius: 8,
        backgroundColor: c.soft,
        paddingVertical: 5,
        paddingHorizontal: 9,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: '700',
          color: good ? c.accent : c.muted,
        }}
      >
        {tr(text)}
      </Text>
    </View>
  );
}
export function EmptyState({
  title,
  text,
  icon = 'file-tray-outline',
  loading = false,
  retry,
}: {
  title: string;
  text: string;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  retry?: () => void;
}) {
  const c = usePalette();
  return (
    <View style={{ alignItems: 'center', padding: 30, gap: 14 }}>
      {loading ? (
        <ActivityIndicator color={c.accent} size="large" />
      ) : (
        <Ionicons name={icon} size={42} color={c.muted} />
      )}
      <Text style={[ui.heading, { color: c.text, textAlign: 'center' }]}>
        {tr(title)}
      </Text>
      <Text style={[ui.body, { color: c.muted, textAlign: 'center' }]}>
        {tr(text)}
      </Text>
      {retry && (
        <Button label="Erneut laden" onPress={retry} secondary icon="refresh" />
      )}
    </View>
  );
}
export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  const c = usePalette();
  return (
    <View
      style={[
        ui.row,
        {
          paddingHorizontal: 14,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 14,
          backgroundColor: c.card,
        },
      ]}
    >
      <Ionicons name="search" color={c.muted} size={18} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={tr(placeholder)}
        placeholderTextColor={c.muted}
        style={{ flex: 1, minHeight: 48, color: c.text, fontSize: 14 }}
        autoCapitalize="none"
      />
      {!!value && (
        <Pressable
          accessibilityLabel={tr('Suche löschen')}
          onPress={() => onChangeText('')}
          hitSlop={12}
        >
          <Ionicons name="close-circle" size={20} color={c.muted} />
        </Pressable>
      )}
    </View>
  );
}
