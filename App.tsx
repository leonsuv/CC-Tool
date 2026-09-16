import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
} from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider, useTheme } from './src/contexts/ThemeContext';
import { PrinterConnectionsProvider } from './src/contexts/PrinterConnectionsContext';
import { usePalette } from './src/components/StudioUI';
import './global.css';
import { LanguageProvider, useLanguage } from './src/i18n';

function AppContent() {
  useLanguage();
  const { colorScheme } = useTheme();
  const c = usePalette();
  const base = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void NavigationBar.setBackgroundColorAsync(c.bg).catch(() => {});
    void NavigationBar.setButtonStyleAsync(
      colorScheme === 'dark' ? 'light' : 'dark'
    ).catch(() => {});
  }, [colorScheme, c.bg]);
  return (
    <NavigationContainer
      theme={{
        ...base,
        colors: {
          ...base.colors,
          background: c.bg,
          card: c.card,
          text: c.text,
          border: c.line,
          primary: c.accent,
        },
      }}
    >
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </NavigationContainer>
  );
}
export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <PrinterConnectionsProvider>
          <AppContent />
        </PrinterConnectionsProvider>
      </ThemeProvider>
    </LanguageProvider>
  );
}
