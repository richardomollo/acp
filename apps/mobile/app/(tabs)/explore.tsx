import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';

export default function ExploreScreen() {
  const activities = [
    'Yoga',
    'Swimming',
    'Gym',
    'Tennis',
    'Boxing',
    'Pilates',
    'Running',
    'Cycling',
  ];

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Explore Activities</ThemedText>
      </View>

      <View style={styles.grid}>
        {activities.map((activity, index) => (
          <TouchableOpacity key={index} style={styles.activityCard}>
            <ThemedText style={styles.activityText}>{activity}</ThemedText>
          </TouchableOpacity>
        ))}
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
  },
  grid: {
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  activityCard: {
    width: '48%',
    backgroundColor: '#667eea',
    padding: 30,
    borderRadius: 12,
    marginBottom: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});