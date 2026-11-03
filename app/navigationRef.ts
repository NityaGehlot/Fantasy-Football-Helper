// app/navigationRef.ts
// Lets code outside a screen (notifications) open a screen.

import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef<any>();

export function openTab(screen: 'Home' | 'Fantasy' | 'Trades' | 'ChatBot', params?: Record<string, unknown>) {
  if (navigationRef.isReady()) navigationRef.navigate('MainTabs', { screen, params });
}
