import { Stack } from 'expo-router';
import { OnboardingProvider } from '@/contexts/onboarding-context';

export default function OnboardingLayout() {
  return (
    <OnboardingProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="goal" />
        <Stack.Screen name="success" />
        <Stack.Screen name="starting-point" />
        <Stack.Screen name="barriers" />
        <Stack.Screen name="activities" />
        <Stack.Screen name="plan" options={{ animation: 'fade', gestureEnabled: false }} />
      </Stack>
    </OnboardingProvider>
  );
}
