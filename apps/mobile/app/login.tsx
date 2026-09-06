import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Image,
  Text,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { getPostAuthDestination } from '@/lib/onboarding-auth';
import { palette, radii, fontSize } from '@/constants/theme';

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showAuthModal } = useAuthModal();

  const redirectTo = (params.redirect as string) || '/(tabs)';
  const signupHref = `/signup${params.redirect ? `?redirect=${params.redirect}` : ''}`;

  const openLogin = () => {
    showAuthModal(async (userId) => {
      const dest = await getPostAuthDestination(userId, redirectTo);
      const href = dest === '/onboarding/goal' ? `${dest}?redirect=${encodeURIComponent(redirectTo)}` : dest;
      router.replace(href as any);
    }, { defaultTab: 'login' });
  };

  return (
    <View style={styles.choiceContainer}>
      {/* Same top fade as the Home screen */}
      <LinearGradient
        colors={[palette.blue100, 'rgba(208,224,255,0)']}
        style={styles.topFadeBg}
        pointerEvents="none"
      />

      <View style={styles.choiceCenter}>
        <Image
          source={require('@/assets/images/lana-wordmark.png')}
          style={styles.bigLogo}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>Lana</Text>
        <Text style={styles.title}>Your goals. Your plan. Your active healthy life.</Text>
        <Text style={styles.subtitle}>Science-backed wellness, fitness, nutrition and experiences</Text>
      </View>

      <View style={styles.choiceBottom}>

        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => router.push(signupHref as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>Register</Text>
        </TouchableOpacity>

        <View style={[styles.divider, { marginBottom: 0 }]}>
          <View style={styles.dividerLine} />
          <Text style={styles.accountLineText}>Already have an account?</Text>
          <View style={styles.dividerLine} />
        </View>

        <TouchableOpacity
          style={styles.loginBtn}
          onPress={openLogin}
          activeOpacity={0.85}
        >
          <Text style={styles.loginBtnText}>Login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  choiceContainer: {
    flex: 1,
    backgroundColor: palette.white,
    paddingHorizontal: 28,
    paddingBottom: 40,
    justifyContent: 'space-between',
  },
  topFadeBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 460,
  },
  choiceCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigLogo: {
    width: 150,
    height: 63,
    marginBottom: 12,
  },
  brandName: {
    marginBottom: 22,
    fontWeight: '700',
    color: palette.ink700,
    fontSize: fontSize.sm,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: fontSize['4xl'],
    fontWeight: '700',
    color: palette.ink700,
    textAlign: 'center',
    lineHeight: 39,
    letterSpacing: -0.5,
    marginBottom: 12,
    maxWidth: 360,
  },
  subtitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: palette.gray450,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 270,
  },
  choiceBottom: {
    gap: 16,
  },
  changeStarts: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: palette.ink700,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  accountLineText: {
    fontSize: fontSize.base,
    color: palette.gray450,
    fontWeight: '500',
  },
  ctaBtn: {
    backgroundColor: palette.ink900,
    paddingVertical: 16,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  ctaBtnText: {
    color: palette.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.hairline,
  },
  loginBtn: {
    borderWidth: 2,
    borderColor: palette.ink900,
    paddingVertical: 15,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  loginBtnText: {
    color: palette.ink900,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
});
