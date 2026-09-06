"use client";

// LANA PRO — Phase 3 client-invitation UI, RE-HOMED for Phase 4.1.
//
// These two steps (AddClients, ReviewInvites) are the reusable heart of the
// "bring your clients" flow. They are onboarding-independent: staged clients
// live in the caller's local state, `ReviewInvites` resolves the professional
// via the current session, and the only writes are `pt_clients` inserts on
// explicit confirm. Used BOTH by the onboarding wrapper
// (app/lana-pro/onboarding/ProfessionalClientInvite.tsx) AND the standalone
// post-onboarding page (app/lana-pro/(app)/clients/invite/page.tsx).
//
// PRIVACY: nothing is sent until the professional presses "Send invitations".

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { StepHeading, PrimaryButton, fieldClass, fieldErrorClass } from "@/app/lana-pro/onboarding/OnboardingShell";
import {
  EMPTY_STAGED_CLIENT,
  validateStagedClient,
  stagedClientIsValid,
  stagedClientName,
  isDuplicateOf,
  parseClientCsv,
  buildInvitePreview,
  newInviteCode,
  type StagedClient,
  type ParsedCsvRow,
  type InviteRoute,
} from "@/lib/lana-pro-onboarding/client-invite";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Resolution = {
  route: InviteRoute;
  matchedUserId?: string;
  matchedName?: string;
};

// ── add_clients ─────────────────────────────────────────────────────────────

export function AddClients({
  staged,
  setStaged,
  onContinue,
  onSkip,
  skipLabel = "Skip for now",
}: {
  staged: StagedClient[];
  setStaged: (updater: (s: StagedClient[]) => StagedClient[]) => void;
  onContinue: () => void;
  onSkip: () => void;
  skipLabel?: string;
}) {
  const [draft, setDraft] = useState<StagedClient>(EMPTY_STAGED_CLIENT);
  const [showErrors, setShowErrors] = useState(false);
  const [csvNote, setCsvNote] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<ParsedCsvRow[] | null>(null);

  const errors = validateStagedClient(draft);
  const dup = isDuplicateOf(staged, draft);

  const addDraft = () => {
    if (!stagedClientIsValid(draft) || dup) {
      setShowErrors(true);
      return;
    }
    setStaged((s) => [...s, draft]);
    setDraft(EMPTY_STAGED_CLIENT);
    setShowErrors(false);
  };

  const onCsvFile = async (file: File) => {
    setCsvNote(null);
    setCsvRows(null);
    const text = await file.text();
    const parsed = parseClientCsv(text);
    if (parsed.headerError) {
      setCsvNote(parsed.headerError);
      return;
    }
    if (parsed.empty) {
      setCsvNote("No client rows found in that file.");
      return;
    }
    setCsvRows(parsed.rows);
  };

  const importReadyRows = () => {
    if (!csvRows) return;
    const toAdd = csvRows
      .filter((r) => r.status === "ready")
      .map((r) => r.client)
      .filter((c) => !isDuplicateOf(staged, c));
    setStaged((s) => [...s, ...toAdd]);
    setCsvRows(null);
    setCsvNote(`Added ${toAdd.length} ${toAdd.length === 1 ? "client" : "clients"}.`);
  };

  const set = (field: keyof StagedClient, v: string) => setDraft((d) => ({ ...d, [field]: v }));

  return (
    <div className="max-w-2xl">
      <StepHeading
        eyebrow="Add clients"
        title="Who would you like to bring across?"
        subtitle="Add them one at a time, or upload a list. You'll review everything before anything is sent."
      />

      {staged.length > 0 && (
        <div className="mb-7">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.14em] mb-2">{staged.length} to invite</p>
          <ul className="rounded-xl border border-gray-100 divide-y divide-gray-100">
            {staged.map((c, i) => (
              <li key={`${c.email}-${c.mobile}-${i}`} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{stagedClientName(c) || "Unnamed client"}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {[c.mobile, c.email].filter(Boolean).join(" · ") || "No contact"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStaged((s) => s.filter((_, j) => j !== i))}
                  className="text-xs font-semibold text-gray-400 hover:text-red-500 flex-shrink-0 ml-3"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-gray-100 bg-gray-50 p-5 mb-6">
        <div className="grid sm:grid-cols-2 gap-4">
          <MiniField label="First name" value={draft.firstName} onChange={(v) => set("firstName", v)}
            error={showErrors ? errors.firstName : undefined} />
          <MiniField label="Last name" value={draft.lastName} onChange={(v) => set("lastName", v)} />
          <MiniField label="Mobile" value={draft.mobile} onChange={(v) => set("mobile", v)}
            error={showErrors ? errors.mobile : undefined} placeholder="+254…" />
          <MiniField label="Email (optional if mobile given)" value={draft.email} onChange={(v) => set("email", v)}
            error={showErrors ? errors.email : undefined} />
        </div>
        {showErrors && errors.contact && <p className="text-xs text-red-500 mt-2">{errors.contact}</p>}
        {showErrors && dup && (
          <p className="text-xs text-amber-600 mt-2">This looks like someone you&apos;ve already added.</p>
        )}
        <button
          type="button"
          onClick={addDraft}
          className="mt-4 rounded-xl border-2 border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#050040]"
        >
          Add to list
        </button>
      </div>

      <div className="mb-9">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 cursor-pointer hover:underline">
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onCsvFile(f);
              e.target.value = "";
            }}
          />
          Upload a CSV instead
        </label>
        <p className="text-xs text-gray-400 mt-1">
          Columns: First name, Last name, Mobile, Email. We&apos;ll flag rows that need attention.
        </p>
        {csvNote && <p className="text-xs text-gray-600 mt-2">{csvNote}</p>}

        {csvRows && (
          <div className="mt-3 rounded-xl border border-gray-100 overflow-hidden">
            <div className="max-h-64 overflow-y-auto overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-400 uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Name</th>
                    <th className="text-left px-3 py-2 font-semibold">Contact</th>
                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {csvRows.map((r) => (
                    <tr key={r.rowNumber}>
                      <td className="px-3 py-2 text-gray-800">{stagedClientName(r.client) || "—"}</td>
                      <td className="px-3 py-2 text-gray-500">
                        {[r.client.mobile, r.client.email].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <CsvStatusPill row={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-3 py-2.5 bg-gray-50 flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {csvRows.filter((r) => r.status === "ready").length} ready ·{" "}
                {csvRows.filter((r) => r.status !== "ready").length} need attention
              </span>
              <button
                type="button"
                onClick={importReadyRows}
                disabled={csvRows.every((r) => r.status !== "ready")}
                className="rounded-lg bg-[#050040] text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-40"
              >
                Add ready rows
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <PrimaryButton onClick={onContinue} disabled={staged.length === 0}>
          Review {staged.length > 0 ? `${staged.length} ` : ""}
          {staged.length === 1 ? "invitation" : "invitations"}
        </PrimaryButton>
        <button
          type="button"
          onClick={onSkip}
          className="text-sm font-semibold text-gray-500 hover:text-gray-800 text-left"
        >
          {skipLabel}
        </button>
      </div>
    </div>
  );
}

function CsvStatusPill({ row }: { row: ParsedCsvRow }) {
  const map = {
    ready: { text: "Ready", cls: "bg-green-50 text-green-700" },
    missing_contact: { text: row.note || "Missing contact information", cls: "bg-amber-50 text-amber-700" },
    duplicate: { text: "Possible duplicate", cls: "bg-gray-100 text-gray-500" },
  } as const;
  const s = map[row.status];
  return <span className={`inline-block rounded-full px-2 py-0.5 font-semibold ${s.cls}`}>{s.text}</span>;
}

// ── review_invites ─────────────────────────────────────────────────────────

export function ReviewInvites({
  staged,
  professionalFirstName,
  onBackToEditing,
  onSent,
}: {
  staged: StagedClient[];
  professionalFirstName: string;
  onBackToEditing: () => void;
  onSent: (count: number) => void;
}) {
  const [resolutions, setResolutions] = useState<Record<number, Resolution>>({});
  const [checking, setChecking] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const next: Record<number, Resolution> = {};
      for (let i = 0; i < staged.length; i++) {
        const c = staged[i];
        const query = c.email.trim() || c.mobile.trim();
        try {
          const { data } = await supabase.rpc("search_client_by_contact", { p_query: query });
          const match = Array.isArray(data) ? data[0] : null;
          next[i] = match
            ? { route: "existing_user", matchedUserId: match.id, matchedName: match.name ?? undefined }
            : { route: "new_user" };
        } catch {
          next[i] = { route: "new_user" };
        }
      }
      if (!cancelled) {
        setResolutions(next);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `staged` is fixed for the lifetime of this step (editing routes back to
    // add_clients, which remounts this component).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const userId = sessionRes.session?.user?.id;
      if (!userId) throw new Error("Your session expired — please sign in again.");
      const { data: pt } = await supabase
        .from("personal_trainers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!pt?.id) throw new Error("We couldn't find your professional profile.");

      const nowIso = new Date().toISOString();
      const rows = staged.map((c, i) => {
        const res = resolutions[i] ?? { route: "new_user" as InviteRoute };
        const baseRow = {
          pt_id: pt.id,
          status: "pending" as const,
          invited_name: stagedClientName(c) || null,
          invite_state: "sent" as const,
          invited_at: nowIso,
        };
        if (res.route === "existing_user" && res.matchedUserId) {
          return { ...baseRow, client_user_id: res.matchedUserId };
        }
        return {
          ...baseRow,
          invite_code: newInviteCode(),
          invited_email: c.email.trim() || null,
          invited_phone: c.mobile.trim() || null,
        };
      });

      const { error: insErr } = await supabase.from("pt_clients").insert(rows);
      if (insErr) throw insErr;

      onSent(rows.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong sending the invitations.");
      setSending(false);
    }
  };

  const existingCount = Object.values(resolutions).filter((r) => r.route === "existing_user").length;

  return (
    <div className="max-w-2xl">
      <StepHeading
        eyebrow="Review"
        title="Here's what each person will see"
        subtitle="No health information, goals or plans are shared in an invitation — only your name."
      />

      <ul className="space-y-3 mb-6">
        {staged.map((c, i) => {
          const res = resolutions[i];
          const preview = buildInvitePreview({ professionalFirstName, inviteeFirstName: c.firstName });
          return (
            <li key={i} className="rounded-2xl border border-gray-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-gray-900">{stagedClientName(c) || "Unnamed client"}</p>
                {checking ? (
                  <span className="text-xs text-gray-400">Checking…</span>
                ) : res?.route === "existing_user" ? (
                  <span className="text-xs font-semibold text-green-700 bg-green-50 rounded-full px-2 py-0.5">
                    Already on Lana · connection request
                  </span>
                ) : (
                  <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                    New to Lana · download invite
                  </span>
                )}
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 p-3 text-sm">
                <p className="font-semibold text-gray-900">{preview.title}</p>
                <p className="text-gray-600 mt-1 leading-relaxed">{preview.body}</p>
                <p className="text-[#050040] font-semibold mt-2">{preview.cta}</p>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Sent to {[c.mobile, c.email].filter(Boolean).join(" or ") || "their contact details"}
              </p>
            </li>
          );
        })}
      </ul>

      {existingCount > 0 && (
        <p className="text-xs text-gray-500 mb-4">
          {existingCount} of these already use Lana — they&apos;ll get a connection request inside the app instead of a
          download link.
        </p>
      )}

      <div className="rounded-xl bg-blue-50/60 border border-blue-100 px-4 py-3 text-sm text-gray-700 mb-6">
        We won&apos;t contact anyone until you confirm. Each person has to accept before they become an active client or
        anything is shared.
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-600 text-sm px-4 py-3 mb-6">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <PrimaryButton onClick={send} disabled={sending || checking}>
          {sending ? "Sending…" : `Send ${staged.length} ${staged.length === 1 ? "invitation" : "invitations"}`}
        </PrimaryButton>
        <button
          type="button"
          onClick={onBackToEditing}
          disabled={sending}
          className="text-sm font-semibold text-gray-500 hover:text-gray-800 text-left disabled:opacity-40"
        >
          Back to editing
        </button>
      </div>
    </div>
  );
}

// ── shared ─────────────────────────────────────────────────────────────────

function MiniField({
  label,
  value,
  onChange,
  error,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className={error ? fieldErrorClass : fieldClass}
      />
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
