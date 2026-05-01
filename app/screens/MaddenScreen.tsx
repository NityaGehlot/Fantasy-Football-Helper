import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function MaddenScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Madden Scanner Screen</Text>
      <Text style={styles.subtitle}>This is where defense scanning will happen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f6fc' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#555', textAlign: 'center', paddingHorizontal: 20 },
});
