import { Tabs } from 'expo-router';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { palette } from '@/constants/theme';
import { registerForPushNotifications } from '@/services/notifications';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const INACTIVE_COLOR = palette.gray300;

const TAB_DEFS = [
  { name: 'index',    label: 'Home',     icon: 'home-outline',    iconActive: 'home'    },
  { name: 'discover', label: 'Discover', icon: 'search-outline', iconActive: 'search' },
  { name: 'fitness',  label: 'Fitness',  icon: 'barbell-outline', iconActive: 'barbell' },
  { name: 'check-in', label: 'Check In', icon: 'scan-outline',    iconActive: 'scan'    },
  { name: 'profile',  label: 'Profile',  icon: 'person-outline',  iconActive: 'person'  },
];

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const visibleRoutes = state.routes.filter(
    (r) => (descriptors[r.key].options as any).href !== null,
  );

  return (
    <View
      style={[
        styles.barOuter,
        { bottom: Math.max(insets.bottom, 8) + 12 },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.barInner}>
        {visibleRoutes.map((route) => {
          const globalIndex = state.routes.findIndex((r) => r.key === route.key);
          const isFocused = state.index === globalIndex;
          const def = TAB_DEFS.find((t) => t.name === route.name);
          if (!def) return null;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              onPress={onPress}
              activeOpacity={0.8}
              style={styles.tabItem}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={def.label}
            >
              <View style={[styles.iconPill, isFocused && styles.iconPillActive]}>
                <Ionicons
                  name={(isFocused ? def.iconActive : def.icon) as any}
                  size={22}
                  color={isFocused ? palette.white : INACTIVE_COLOR}
                />
              </View>
              <Text style={[styles.label, isFocused && styles.labelActive]}>
                {def.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function TabLayout() {
  const { showAuthModal } = useAuthModal();
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (userId) registerForPushNotifications();
  }, [userId]);

  const handleProfilePress = (e: any) => {
    if (!userId) {
      e.preventDefault();
      showAuthModal((uid) => setUserId(uid), { redirectTo: '/(tabs)/fitness' });
    }
  };

  const handleCheckInPress = (e: any) => {
    if (!userId) {
      e.preventDefault();
      showAuthModal((uid) => setUserId(uid), { redirectTo: '/(tabs)/check-in' });
    }
  };

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"    options={{ title: 'Home' }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover' }} />
      <Tabs.Screen name="fitness"  options={{ title: 'Fitness' }} />
      <Tabs.Screen
        name="check-in"
        options={{ title: 'Check In' }}
        listeners={{ tabPress: handleCheckInPress }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: 'Profile', headerShown: false }}
        listeners={{ tabPress: handleProfilePress }}
      />

      {/* Hidden routes */}
      <Tabs.Screen name="venues"      options={{ href: null }} />
      <Tabs.Screen name="classes"     options={{ href: null }} />
      <Tabs.Screen name="trainers"    options={{ href: null }} />
      <Tabs.Screen name="experiences" options={{ href: null }} />
      <Tabs.Screen name="communities" options={{ href: null }} />
    </Tabs>
  );
}

const BAR_HEIGHT = 68;
const PILL_SIZE = 40;

const styles = StyleSheet.create({
  barOuter: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  barInner: {
    flexDirection: 'row',
    width: '100%',
    height: BAR_HEIGHT,
    backgroundColor: palette.white,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    shadowColor: palette.ink900,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 16,
    borderWidth: 1,
    borderColor: palette.borderFaint,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
  },
  iconPill: {
    width: PILL_SIZE,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPillActive: {
    backgroundColor: palette.blue500,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    color: INACTIVE_COLOR,
    letterSpacing: 0.1,
  },
  labelActive: {
    color: palette.blue500,
    fontWeight: '700',
  },
});
