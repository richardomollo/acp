// Lana Chat V1 — "Ask Lana", now a bottom-tab root (moved from a pushed
// screen). A simple, session-scoped conversation (§13 — no durable coaching
// memory from raw chat, nothing persisted once this screen unmounts).
// Reuses the existing design system only: palette tokens, ink/black primary
// action, Lana blue accent — no generic chat-app look.
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { palette, radii, fontSize } from '@/constants/theme';
import { authService } from '@/services/auth';
import { nutritionReferenceService } from '@/services/nutrition-reference-service';
import { resolveDailyMacroTargets, type MacroTargetRange } from '@/lib/nutrition/daily-macro-targets';
import { sendLanaChatMessage, lanaChatFallbackReply, type LanaChatTurn } from '@/lib/lana-chat/client';

interface DisplayMessage extends LanaChatTurn {
  id: string;
  isError?: boolean;
}

const SUGGESTED_PROMPTS = [
  'What should I focus on today?',
  'How am I doing this week?',
  'What should I eat after training?',
  'Why did my plan change?',
];

let nextId = 0;
function newId(): string {
  nextId += 1;
  return `m${nextId}`;
}

export default function LanaChatScreen() {
  const scrollRef = useRef<ScrollView>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [proteinTargetG, setProteinTargetG] = useState<MacroTargetRange | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const session = await authService.getSession();
      if (!session?.user.id || !session.access_token) return;
      setUserId(session.user.id);
      setAccessToken(session.access_token);
      // The one already-computed personal fact the server can't safely
      // re-derive itself — same resolver Today's macro graph already uses.
      try {
        const refContext = await nutritionReferenceService.resolveUserReferenceContext(session.user.id);
        setProteinTargetG(resolveDailyMacroTargets(refContext).proteinTargetG);
      } catch {
        setProteinTargetG(null);
      }
    })();
  }, []);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !userId || !accessToken || sending) return;

    const history: LanaChatTurn[] = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(prev => [...prev, { id: newId(), role: 'user', content: trimmed }]);
    setInput('');
    setSending(true);
    try {
      const result = await sendLanaChatMessage(userId, accessToken, trimmed, history, proteinTargetG);
      if (result.ok && result.reply) {
        setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: result.reply! }]);
      } else {
        setMessages(prev => [...prev, { id: newId(), role: 'assistant', content: lanaChatFallbackReply, isError: true }]);
      }
    } finally {
      setSending(false);
    }
  }, [userId, accessToken, proteinTargetG, sending, messages]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, sending]);

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      <SafeAreaView edges={['top']} style={s.header}>
        <ThemedText style={s.title}>Lana</ThemedText>
      </SafeAreaView>

      <ScrollView ref={scrollRef} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <View style={s.emptyState}>
            <ThemedText style={s.emptyTitle}>How can I help?</ThemedText>
            <View style={s.promptList}>
              {SUGGESTED_PROMPTS.map(p => (
                <TouchableOpacity key={p} style={s.promptChip} onPress={() => send(p)} accessibilityRole="button" accessibilityLabel={p}>
                  <ThemedText style={s.promptText}>{p}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          messages.map(m => (
            <View key={m.id} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleLana, m.isError && s.bubbleError]}>
              <ThemedText style={[s.bubbleText, m.role === 'user' && s.bubbleTextUser]}>{m.content}</ThemedText>
            </View>
          ))
        )}
        {sending && (
          <View style={[s.bubble, s.bubbleLana]}>
            <ActivityIndicator size="small" color={palette.gray450} />
          </View>
        )}
      </ScrollView>

      <View style={s.inputBar}>
        <TextInput
          style={s.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask Lana..."
          placeholderTextColor={palette.gray300}
          multiline
          editable={!!userId}
          accessibilityLabel="Message Lana"
        />
        <TouchableOpacity
          style={[s.sendBtn, (!input.trim() || sending || !userId) && s.sendBtnDisabled]}
          onPress={() => send(input)}
          disabled={!input.trim() || sending || !userId}
          accessibilityRole="button"
          accessibilityLabel="Send"
        >
          <Ionicons name="arrow-up" size={18} color={palette.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: palette.ink900 },
  body: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24 },
  emptyState: { flex: 1, justifyContent: 'center', gap: 20 },
  emptyTitle: { fontSize: 22, fontWeight: '800', color: palette.ink900, textAlign: 'center', marginBottom: 4 },
  promptList: { gap: 10 },
  promptChip: {
    backgroundColor: palette.blue50, borderRadius: radii.xl,
    borderWidth: 1, borderColor: palette.blue100, paddingVertical: 12, paddingHorizontal: 16,
  },
  promptText: { fontSize: 14, fontWeight: '600', color: palette.blue600, textAlign: 'center' },
  bubble: { borderRadius: radii.xl, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, maxWidth: '86%' },
  bubbleLana: { backgroundColor: palette.surfaceMuted, alignSelf: 'flex-start' },
  bubbleUser: { backgroundColor: palette.ink900, alignSelf: 'flex-end' },
  bubbleError: { backgroundColor: palette.blue50 },
  bubbleText: { fontSize: 14.5, lineHeight: 20, color: palette.ink900 },
  bubbleTextUser: { color: palette.white },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: palette.hairline,
  },
  input: {
    flex: 1, maxHeight: 100, fontSize: 14.5, color: palette.ink900,
    backgroundColor: palette.surfaceMuted, borderRadius: radii.xl,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  sendBtn: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: palette.ink900,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: palette.gray300 },
});
