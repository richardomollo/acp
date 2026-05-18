import { Tabs, useRouter } from 'expo-router';
import { Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { authService } from '@/services/auth';


export default function TabLayout() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const session = await authService.getSession();
    setUserId(session?.user.id || null);
  };

  const handleProfilePress = (e: any) => {
    // Check if user is logged in
    if (!userId) {
      e.preventDefault(); // Prevent navigation to profile
      router.push('/login?redirect=/(tabs)/profile'); // Pass redirect param
    }
  };

  const handleCheckInPress = (e: any) => {
    // Check if user is logged in
    if (!userId) {
      e.preventDefault(); // Prevent navigation to profile
      router.push('/login?redirect=/(tabs)/check-in'); // Pass redirect param
    }
  };

  return (
    <Tabs
      screenOptions={{
         headerShown: false,
        tabBarActiveTintColor: '#667eea',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: Platform.OS === 'ios' ? 88 : 60,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 10,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
       
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="home-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="venues"
        options={{
          title: 'Venues',
          tabBarIcon: ({ color }) => <Ionicons name="search-outline" color={color}/>,
        }}
      />
      <Tabs.Screen
        name="classes"
        options={{
          title: 'Classes',
          tabBarIcon: ({ color }) => <Ionicons name="baseball" color={color} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: 'Check-in',
          tabBarIcon: ({ color }) => <Ionicons name="barcode" color={color} />,
        }}
        // listeners={{
        //   tabPress: handleCheckInPress,
        // }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerShown: false,
          tabBarIcon: ({ color }) => <Ionicons name="person" color={color} />,
        }}
        // listeners={{
        //   tabPress: handleProfilePress,
        // }}
      />
    </Tabs>
  );
}

// Simple icon component (you can replace with actual icons later)
function TabBarIcon({ name, color }: { name: string; color: string }) {
  return (
    <View style={{ width: 24, height: 24, backgroundColor: color, borderRadius: 12 }} />
  );
}