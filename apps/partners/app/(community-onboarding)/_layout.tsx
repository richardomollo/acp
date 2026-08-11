import { Stack } from 'expo-router';

export default function CommunityOnboardingLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="create" />
      <Stack.Screen name="pending" />
    </Stack>
  );
}
