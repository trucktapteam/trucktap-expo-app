import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LightColors, DarkColors } from '@/constants/colors';

export type ThemeMode = 'light' | 'dark' | 'system';

export type Theme = typeof LightColors;

export const [ThemeProvider, useTheme] = createContextHook(() => {
  const systemTheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadThemeMode();
  }, []);

  const loadThemeMode = async () => {
    try {
      const stored = await AsyncStorage.getItem('themeMode');
      if (stored && (stored === 'light' || stored === 'dark' || stored === 'system')) {
        setThemeModeState(stored as ThemeMode);
      }
    } catch (error) {
      console.log('Error loading theme mode:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const setThemeMode = async (mode: ThemeMode) => {
    setThemeModeState(mode);
    try {
      await AsyncStorage.setItem('themeMode', mode);
    } catch (error) {
      console.log('Error saving theme mode:', error);
    }
  };

  const activeTheme = themeMode === 'system' 
    ? (systemTheme === 'dark' ? 'dark' : 'light')
    : themeMode;

  const colors: Theme = activeTheme === 'dark' ? DarkColors : LightColors;

  return {
    themeMode,
    setThemeMode,
    activeTheme,
    colors,
    isDark: activeTheme === 'dark',
    isLoading,
  };
});
