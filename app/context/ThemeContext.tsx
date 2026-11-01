// app/context/ThemeContext.tsx
// Light / dark / match-device appearance, saved on the device.

import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, type Palette } from '../theme';

export type ThemeMode = 'system' | 'light' | 'dark';

type ThemeContextType = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  isDark: boolean;
  colors: Palette;
};

const STORAGE_KEY = 'ffh_theme_mode_v1';

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  setMode: () => undefined,
  isDark: false,
  colors: lightColors,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(saved => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
      })
      .catch(() => undefined);
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  };

  const isDark = mode === 'dark' || (mode === 'system' && system === 'dark');
  const value = useMemo(
    () => ({ mode, setMode, isDark, colors: isDark ? darkColors : lightColors }),
    [mode, isDark]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Build a StyleSheet from the active palette; rebuilt only when the theme changes. */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Palette) => T): T {
  const { colors } = useTheme();
  return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
}

/**
 * Like useThemedStyles but without strict style typing, for large screens whose style
 * objects were written before theming (their literal values aren't typed as const).
 */
export function useLooseThemedStyles(factory: (c: Palette) => Record<string, any>): any {
  const { colors } = useTheme();
  return useMemo(() => StyleSheet.create(factory(colors) as any), [colors]);
}
