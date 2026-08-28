import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '@/components/themed-text';
import { OnboardingHeader } from '@/components/onboarding/onboarding-header';
import { OnboardingFooter } from '@/components/onboarding/onboarding-footer';
import { SelectCard } from '@/components/onboarding/select-card';
import { useOnboarding } from '@/contexts/onboarding-context';
import { GOAL_OPTIONS } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';
import { palette, radii, fontSize } from '@/constants/theme';

const DATA_POINTS: { icon: string; title: string; desc: string }[] = [
  { icon: 'flag-outline', title: 'What you tell us', desc: 'Your goals, starting point, schedule, preferences and what tends to get in your way.' },
  { icon: 'trending-up-outline', title: 'What ACP learns', desc: 'What you complete and how your plan fits your routine — real progress that helps ACP learn what works for you.' },
  { icon: 'people-outline', title: 'Real support, when it helps', desc: 'Nutritionists, personal trainers, classes, sessions, or communities tailored to you — recommended, never forced.' },
  { icon: 'sync-outline', title: 'Adapts with you', desc: 'Your plan evolves as ACP learns what works for you, while keeping your goals and preferences at the centre.' },
];

export default function OnboardingGoalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { answers, setGoal, setRedirectTo, saveProgress, hydrated, resumeRoute, userName, setUserName } = useOnboarding();

  // Conversational opener — only asked when we don't already have a name on
  // file (e.g. password signup already collects one; some social logins
  // don't). Checked once per mount; nothing renders until this resolves, so
  // a user we already know never sees the ask flash by. Resolved name is
  // stored in onboarding context (userName) so later steps can use it too.
  const [userId, setUserId] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(true);
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [introSeen, setIntroSeen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) { setNameSubmitted(true); setCheckingName(false); return; }
      const { data } = await supabase.from('users').select('name').eq('id', uid).maybeSingle();
      // Same fallback chain as Home's own greeting (userData?.name ->
      // user_metadata.full_name -> email prefix) so "we already know your
      // name" means the same thing on both screens — accounts with no real
      // name row (e.g. some partner/social-login accounts) still resolve to
      // whatever Home would greet them with, instead of asking again.
      const emailPrefix = session?.user.email?.split('@')[0];
      const capitalizedEmailPrefix = emailPrefix ? emailPrefix[0].toUpperCase() + emailPrefix.slice(1) : '';
      const resolvedName = data?.name || session?.user.user_metadata?.full_name || capitalizedEmailPrefix;
      if (resolvedName) {
        setUserName(resolvedName);
        setNameSubmitted(true);
        // Only backfill users.name from a real name source — never persist
        // the email-prefix guess as someone's actual name.
        if (!data?.name && session?.user.user_metadata?.full_name) {
          supabase.from('users').update({ name: resolvedName }).eq('id', uid).then(() => {});
        }
      }
      setCheckingName(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (params.redirect) setRedirectTo(params.redirect as string);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.redirect]);

  // Resume in-progress onboarding at the step the user was last on, instead
  // of always restarting at step 1. Uses push (not replace) so goal.tsx
  // stays underneath in the nav stack — otherwise the back button on the
  // resumed step would have nothing left in the onboarding stack to pop to
  // and would exit all the way out to whatever screen opened onboarding.
  useEffect(() => {
    if (hydrated && resumeRoute && resumeRoute !== '/onboarding/goal') {
      router.push(resumeRoute as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, resumeRoute]);

  const handleSubmitName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setSavingName(true);
    if (userId) {
      try {
        await supabase.from('users').update({ name: trimmed }).eq('id', userId);
      } catch {
        // Best-effort — onboarding shouldn't block on this; the name can
        // always be added later from Personal Details.
      }
    }
    setUserName(trimmed);
    setSavingName(false);
    setNameSubmitted(true);
  };

  const handleContinue = () => {
    saveProgress();
    router.push('/onboarding/success');
  };

  const handleExit = () => {
    saveProgress();
    router.replace('/(tabs)');
  };

  const firstName = userName.split(' ')[0];

  return (
    <View style={styles.root}>
      <OnboardingHeader step={1} onExit={handleExit} />

      {checkingName ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={palette.ink700} />
        </View>
      ) : !nameSubmitted ? (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <ThemedText style={styles.headline}>Hey! What should we call you?</ThemedText>
            <ThemedText style={styles.sub}>
              This whole thing takes less than 90 seconds, and finishing it is what lets us build a
              plan that actually fits your life instead of a generic one.
            </ThemedText>
            <TextInput
              style={styles.nameInput}
              placeholder="Your first name"
              placeholderTextColor={palette.gray300}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={handleSubmitName}
            />
          </ScrollView>
          <OnboardingFooter label="Continue" onPress={handleSubmitName} disabled={!nameInput.trim()} loading={savingName} />
        </>
      ) : !introSeen ? (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.headline}>
              {firstName ? `${firstName}, meet ACP Intelligence™` : 'Meet ACP Intelligence™'}
            </ThemedText>
            <ThemedText style={styles.tagline}>Your AI coach that learns what works for you.</ThemedText>
            <ThemedText style={styles.sub}>
              Tell ACP Intelligence™ what you want to achieve and where you&apos;re starting. It
              will build your plan, learn from your progress, adapt as you go, and recommend
              nutritionists, personal trainers, classes, sessions, or communities tailored to you
              — recommended, never forced.
            </ThemedText>

            <View style={styles.list}>
              {DATA_POINTS.map(p => (
                <View key={p.title} style={styles.dataPointRow}>
                  <View style={styles.dataPointIcon}>
                    <Ionicons name={p.icon as any} size={18} color={palette.blue600} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText style={styles.dataPointTitle}>{p.title}</ThemedText>
                    <ThemedText style={styles.dataPointDesc}>{p.desc}</ThemedText>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
          <OnboardingFooter label="Build my plan" onPress={() => setIntroSeen(true)} />
        </>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <ThemedText style={styles.headline}>What would you like to work towards?</ThemedText>
            <ThemedText style={styles.sub}>Choose your main goal. ACP Intelligence™ will use this as the starting point for your plan.</ThemedText>

            <View style={styles.list}>
              {GOAL_OPTIONS.map(g => (
                <SelectCard
                  key={g.key}
                  icon={g.icon}
                  label={g.label}
                  desc={g.desc}
                  selected={answers.goal === g.key}
                  onPress={() => setGoal(g.key)}
                />
              ))}
            </View>
          </ScrollView>
          <OnboardingFooter label="Continue" onPress={handleContinue} disabled={!answers.goal} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },
  headline: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: palette.ink700,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  tagline: {
    fontSize: fontSize.base,
    fontWeight: '700',
    color: palette.ink700,
    marginBottom: 10,
  },
  sub: {
    fontSize: fontSize.base,
    color: palette.gray450,
    marginBottom: 24,
  },
  list: { gap: 10 },
  dataPointRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  dataPointIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: palette.blue50,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dataPointTitle: { fontSize: fontSize.base, fontWeight: '700', color: palette.ink900 },
  dataPointDesc: { fontSize: fontSize.sm, color: palette.gray450, marginTop: 2, lineHeight: 19 },
  nameInput: {
    borderWidth: 1.5,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: palette.ink700,
    backgroundColor: palette.white,
  },
});
