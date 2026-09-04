// app/index.tsx
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Splash() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        supabase.auth.signOut().finally(() => setChecking(false));
        return;
      }
      if (!session?.user) { setChecking(false); return; }

      const user = session.user;
      if (user.user_metadata?.role === 'personal_trainer') {
        const { data: pt } = await supabase
          .from('personal_trainers')
          .select('status')
          .eq('user_id', user.id)
          .single();
        if (pt?.status === 'approved') {
          router.replace('/(pt-tabs)');
        } else if (pt) {
          router.replace('/(pt-onboarding)/pending');
        } else {
          await supabase.auth.signOut();
          router.replace('/(auth)/partner-login');
        }
      } else {
        router.replace('/(tabs)');
      }
    }).catch(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color="#000" />
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* Hero Section with Image */}
      {/* <View style={styles.heroImage}> */}
        {/* Replace this with actual image */}
        {/* <Image
          source={{ uri: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80' }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.imageOverlay} />
      </View> */}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>Lana Health</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>For Partners</Text>
          </View>
        </View>

        <Text style={styles.headline}>
          Fill Empty Spots.{"\n"}
          Earn More Revenue.
        </Text>

        <Text style={styles.subheadline}>
          Join Kenya's leading wellness network and turn your off-peak hours into profit
        </Text>

        {/* Benefits */}
        <View style={styles.benefitsContainer}>
          <View style={styles.benefitCard}>
            <View style={styles.benefitIcon}>
              <Ionicons name="cash-outline" size={24} color="#000000" />
            </View>
            <Text style={styles.benefitTitle}>Guaranteed Revenue</Text>
            <Text style={styles.benefitText}>
              Fill off-peak slots and earn incremental income
            </Text>
          </View>

          <View style={styles.benefitCard}>
            <View style={styles.benefitIcon}>
              <Ionicons name="people-outline" size={24} color="#000000" />
            </View>
            <Text style={styles.benefitTitle}>New Members</Text>
            <Text style={styles.benefitText}>
              Access thousands of fitness-focused customers
            </Text>
          </View>

          <View style={styles.benefitCard}>
            <View style={styles.benefitIcon}>
              <Ionicons name="shield-checkmark-outline" size={24} color="#000000" />
            </View>
            <Text style={styles.benefitTitle}>You Stay in Control</Text>
            <Text style={styles.benefitText}>
              Set your hours, capacity, and pricing
            </Text>
          </View>
        </View>

        {/* Social Proof
        <View style={styles.proofContainer}>
          <View style={styles.proofItem}>
            <Text style={styles.proofNumber}>500+</Text>
            <Text style={styles.proofLabel}>Partner Gyms</Text>
          </View>
          <View style={styles.proofDivider} />
          <View style={styles.proofItem}>
            <Text style={styles.proofNumber}>50K+</Text>
            <Text style={styles.proofLabel}>Active Members</Text>
          </View>
          <View style={styles.proofDivider} />
          <View style={styles.proofItem}>
            <Text style={styles.proofNumber}>95%</Text>
            <Text style={styles.proofLabel}>Partner Satisfaction</Text>
          </View>
        </View> */}

        {/* CTA Buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/(auth)/partner-login")}
          >
            <Text style={styles.primaryButtonText}>Login</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>

        {/* Trust Badge */}
        <View style={styles.trustBadge}>
          <Ionicons name="checkmark-circle" size={20} color="#00c853" />
          <Text style={styles.trustText}>
            No setup fees • Cancel anytime • Support 24/7
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#ffffff",
  },
  heroImage: {
    width: '100%',
    height: 280,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 100,
    paddingBottom: 40,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 12,
  },
  logo: {
    fontSize: 24,
    fontWeight: "800",
    color: "#000000",
  },
  badge: {
    backgroundColor: '#f0f5ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#002fff',
  },
  headline: {
    fontSize: 32,
    fontWeight: "800",
    color: "#000000",
    lineHeight: 40,
    marginBottom: 10,
    textAlign: "center",
  },
  subheadline: {
    fontSize: 17,
    color: "#666",
    lineHeight: 26,
    textAlign: "center",
    marginBottom: 10,
  },
  benefitsContainer: {
    marginBottom: 30,
  },
  benefitCard: {
    // backgroundColor: '#f8f8f8',
    borderRadius: 16,
    padding: 20,
    marginBottom: 0,
     alignItems: 'center',
    //borderWidth: 1,
    //borderColor: '#f0f0f0',
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f5ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  benefitTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000000",
    marginBottom: 6,
  },
  benefitText: {
    fontSize: 15,
    color: "#666",
    lineHeight: 22,
  },
  proofContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#f0f5ff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 32,
  },
  proofItem: {
    alignItems: 'center',
  },
  proofNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: '#002fff',
    marginBottom: 4,
  },
  proofLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  proofDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#e0e0e0',
  },
  actions: {
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: "#000000",
    paddingVertical: 18,
    borderRadius: 30,
    alignItems: "center",
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#002fff',
    
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  trustText: {
    fontSize: 13,
    color: '#666',
  },
});