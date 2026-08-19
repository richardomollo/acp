import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Image,
  Text,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthModal } from '@/contexts/auth-modal-context';
import { getPostAuthDestination } from '@/lib/onboarding-auth';
import { palette, radii, fontSize } from '@/constants/theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const HERO_HEIGHT = SCREEN_HEIGHT * 0.5;
const HERO_IMAGE = require('@/assets/images/pt.jpeg');

export default function LoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
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
      <View style={[styles.heroImageWrap, { top: -insets.top, height: HERO_HEIGHT + insets.top }]}>
        <Image
          source={HERO_IMAGE}
          style={styles.heroImage}
          resizeMode="contain"
        />
      </View>
      <LinearGradient
        colors={['transparent', 'rgba(255,255,255,0.75)', palette.white]}
        locations={[0, 0.55, 1]}
        style={[styles.heroFade, { top: -insets.top, height: HERO_HEIGHT + insets.top }]}
      />

      <View style={styles.choiceCenter}>
        <Image
          source={require('@/assets/images/icon.png')}
          style={styles.bigLogo}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>Active CityPass</Text>
        <Text style={styles.title}>Your goals. Your plan. Your active and healthy life.</Text>
        <Text style={styles.subtitle}>Science-backed wellness, fitness, nutrition and experiences</Text>
      </View>

      <View style={styles.choiceBottom}>
        <Text style={styles.changeStarts}>Change starts here</Text>

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
  heroImageWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
    backgroundColor: palette.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HERO_HEIGHT,
  },
  choiceCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigLogo: {
    width: 80,
    height: 80,
    borderRadius: radii.lg,
    marginBottom: 12,
  },
  brandName: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: palette.blue500,
    letterSpacing: 0.4,
    marginBottom: 22,
  },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: palette.ink700,
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -0.5,
    marginBottom: 12,
    maxWidth: 300,
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
    backgroundColor: palette.blue500,
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
    borderColor: palette.blue500,
    paddingVertical: 15,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  loginBtnText: {
    color: palette.blue500,
    fontSize: fontSize.base,
    fontWeight: '700',
  },
});
