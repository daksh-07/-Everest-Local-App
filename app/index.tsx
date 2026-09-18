import { StyleSheet, Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>EVEREST LOCAL</Text>
      <Text style={styles.subtitle}>WEB RUNTIME TEST</Text>
      <Text style={styles.body}>JavaScript is running.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 28, fontWeight: '800' },
  subtitle: { fontSize: 18, fontWeight: '700', marginTop: 12 },
  body: { fontSize: 16, marginTop: 12 },
});
