import AppNavigator from './app/AppNavigator';
import AuthGate from "./app/components/AuthGate";
import { Provider as PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { ThemeProvider, useTheme } from './app/context/ThemeContext';

// Paper (menus, dialogs) follows the app's light/dark setting.
function ThemedApp() {
  const { isDark, colors } = useTheme();
  const base = isDark ? MD3DarkTheme : MD3LightTheme;
  const paperTheme = {
    ...base,
    colors: { ...base.colors, primary: colors.primary, background: colors.background, surface: colors.surface, elevation: { ...base.colors.elevation, level2: colors.surface } },
  };
  return (
    <PaperProvider theme={paperTheme}>
      <AuthGate>
        <AppNavigator />
      </AuthGate>
    </PaperProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
