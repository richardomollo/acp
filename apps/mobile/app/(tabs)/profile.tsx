import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <ThemedText style={styles.avatarText}>JD</ThemedText>
        </View>
        <ThemedText type="title" style={styles.name}>John Doe</ThemedText>
        <ThemedText style={styles.email}>john.doe@email.com</ThemedText>
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.menuItem}>
          <ThemedText style={styles.menuText}>My Bookings</ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem}>
          <ThemedText style={styles.menuText}>Membership Details</ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.menuItem}>
          <ThemedText style={styles.menuText}>Settings</ThemedText>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.menuItem}
          onPress={() => router.push('/')}
        >
          <ThemedText style={[styles.menuText, { color: '#ff3b30' }]}>
            Logout
          </ThemedText>
        </TouchableOpacity>
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
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#667eea',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  avatarText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  name: {
    marginBottom: 5,
  },
  email: {
    color: '#666',
    marginBottom: 20,
  },
  section: {
    padding: 20,
  },
  menuItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  menuText: {
    fontSize: 16,
  },
});