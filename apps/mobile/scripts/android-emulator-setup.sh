#!/usr/bin/env bash
# One-time Android emulator setup for running the ACP mobile app locally
# (Apple Silicon). Safe to re-run — every step is idempotent.
set -e

# 1. JDK 17 (Android SDK tools need it). Prompts for your Mac password.
if ! /usr/libexec/java_home >/dev/null 2>&1; then
  brew install --cask temurin@17
fi
export JAVA_HOME="$(/usr/libexec/java_home)"

# 2. Point the SDK tools at the Homebrew SDK root.
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT="$ANDROID_HOME"
SDKM="$ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager"
AVDM="$ANDROID_HOME/cmdline-tools/latest/bin/avdmanager"

# 3. Accept licenses + install: platform-tools (adb), the emulator, an API 34
#    platform, and an ARM64 system image (native speed on Apple Silicon).
yes | "$SDKM" --licenses >/dev/null
"$SDKM" "platform-tools" "emulator" "platforms;android-34" \
        "system-images;android-34;google_apis;arm64-v8a"

export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

# 4. Create a Pixel-ish AVD (skip if it already exists).
if ! "$AVDM" list avd 2>/dev/null | grep -q "Name: acp"; then
  echo "no" | "$AVDM" create avd -n acp \
    -k "system-images;android-34;google_apis;arm64-v8a" -d "pixel_6"
fi

# 5. Boot it in the background, wait for it to be ready.
if ! adb devices | grep -q emulator; then
  ( emulator @acp -no-snapshot-save -no-boot-anim -gpu swiftshader_indirect >/tmp/acp-emu.log 2>&1 & )
  echo "Booting emulator…"
  adb wait-for-device
  until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
fi
echo "Emulator ready:"
adb devices

cat <<'NEXT'

── Next ──────────────────────────────────────────────────────────
Add these to your shell profile (~/.zshrc) so future terminals see them:

  export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
  export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"

Then, from apps/mobile:

  npx expo start --android        # launches the app on the running emulator

(First run installs Expo Go onto the emulator automatically via adb.)
If it can't reach your backend, the app falls back to production
(activecitypass.com + prod Supabase) — .env.local overrides are disabled.
─────────────────────────────────────────────────────────────────
NEXT
