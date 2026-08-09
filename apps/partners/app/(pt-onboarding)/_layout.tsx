import { Stack } from 'expo-router';

export default function PTOnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="pending" />
    </Stack>
  );
}
