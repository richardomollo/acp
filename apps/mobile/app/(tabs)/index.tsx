import { StyleSheet, View, ScrollView } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export default function HomeScreen() {
  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Active CityPass</ThemedText>
        <ThemedText style={styles.subtitle}>Welcome back!</ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Your Membership</ThemedText>
        <ThemedText style={styles.cardText}>50+ Activities Available</ThemedText>
      </View>

      <View style={styles.card}>
        <ThemedText style={styles.cardTitle}>Quick Stats</ThemedText>
        <ThemedText style={styles.cardText}>Workouts this week: 3</ThemedText>
        <ThemedText style={styles.cardText}>Activities tried: 12</ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#667eea',
  },
  subtitle: {
    color: '#fff',
    fontSize: 16,
    marginTop: 5,
  },
  card: {
    backgroundColor: '#f8f8f8',
    margin: 20,
    padding: 20,
    borderRadius: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  cardText: {
    fontSize: 14,
    marginBottom: 5,
    color: '#666',
  },
});