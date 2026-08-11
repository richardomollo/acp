import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, View } from 'react-native';
import { UpdateBanner } from '@/components/update-banner';

const PRIMARY = '#000000';

export default function CommunityTabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: PRIMARY,
          tabBarInactiveTintColor: '#9ca3af',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#f0f0f0',
            height: Platform.OS === 'ios' ? 88 : 68,
            paddingBottom: Platform.OS === 'ios' ? 28 : 10,
            paddingTop: 8,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'home' : 'home-outline'} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="events"
          options={{
            title: 'Events',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'calendar' : 'calendar-outline'} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="create-event"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="challenges"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="members"
          options={{
            title: 'Members',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'people' : 'people-outline'} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="checkin"
          options={{
            title: 'Check-in',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'qr-code' : 'qr-code-outline'} size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? 'person-circle' : 'person-circle-outline'} size={24} color={color} />,
          }}
        />
      </Tabs>
      <UpdateBanner />
    </View>
  );
}
