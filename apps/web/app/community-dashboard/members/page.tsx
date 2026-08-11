"use client";

import { useCallback, useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const INVITE_BASE_URL = "https://activecitypass.com/community/join";

interface MemberRow {
  id: string; user_id: string; role: string; status: string; joined_at: string | null; created_at: string;
}
interface UserInfo { name: string | null; email: string | null }

type Tab = "pending" | "active";

export default function CommunityDashboardMembersPage() {
  const router = useRouter();
  const [communityId, setCommunityId] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [users, setUsers] = useState<Record<string, UserInfo>>({});
  const [tab, setTab] = useState<Tab>("pending");
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/partner-login"); return; }

    const { data: membership } = await supabase
      .from("community_members").select("community_id")
      .eq("user_id", user.id).in("role", ["owner", "admin"]).eq("status", "active")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();

    const cid = membership?.community_id ?? null;
    setCommunityId(cid);
    if (!cid) { setLoading(false); return; }

    const { data: communityRow } = await supabase.from("communities").select("invite_token").eq("id", cid).single();
    setInviteToken(communityRow?.invite_token ?? null);

    const { data: memberRows } = await supabase
      .from("community_members")
      .select("id, user_id, role, status, joined_at, created_at")
      .eq("community_id", cid)
      .order("created_at", { ascending: false });
    setMembers((memberRows as MemberRow[]) ?? []);

    const userIds = [...new Set((memberRows ?? []).map((m) => m.user_id))];
    if (userIds.length > 0) {
      const { data: userRows } = await supabase.from("users").select("id, name, email").in("id", userIds);
      const map: Record<string, UserInfo> = {};
      for (const u of userRows ?? []) map[u.id] = { name: u.name, email: u.email };
      setUsers(map);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => { load(); }, [load]);

  const copyInviteLink = async () => {
    if (!inviteToken) return;
    await navigator.clipboard.writeText(`${INVITE_BASE_URL}/${inviteToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerateInviteLink = async () => {
    if (!communityId || !confirm("The current invite link will stop working. Generate a new one?")) return;
    setRegenerating(true);
    const { data: newToken, error } = await supabase.rpc("regenerate_community_invite_token", { p_community_id: communityId });
    setRegenerating(false);
    if (!error) setInviteToken(newToken);
  };

  const approve = async (m: MemberRow) => {
    setActioningId(m.id);
    const { error } = await supabase.from("community_members").update({ status: "active", joined_at: new Date().toISOString() }).eq("id", m.id);
    if (!error) setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "active" } : x)));
    setActioningId(null);
  };

  const decline = async (m: MemberRow) => {
    if (!confirm("Decline this request?")) return;
    setActioningId(m.id);
    const { error } = await supabase.from("community_members").delete().eq("id", m.id);
    if (!error) setMembers((prev) => prev.filter((x) => x.id !== m.id));
    setActioningId(null);
  };

  const remove = async (m: MemberRow) => {
    if (!confirm("Remove this member?")) return;
    setActioningId(m.id);
    const { error } = await supabase.from("community_members").delete().eq("id", m.id);
    if (!error) setMembers((prev) => prev.filter((x) => x.id !== m.id));
    setActioningId(null);
  };

  const pending = members.filter((m) => m.status === "pending");
  const active = members.filter((m) => m.status === "active");
  const list = tab === "pending" ? pending : active;

  if (loading) return <div className="p-8 text-sm text-gray-400">Loading…</div>;

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Members</h1>

      {inviteToken && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-8">
          <p className="text-sm font-bold text-blue-900 mb-2">Invite people</p>
          <p className="text-xs text-gray-600 mb-3 truncate">{`${INVITE_BASE_URL}/${inviteToken}`}</p>
          <div className="flex gap-2">
            <button onClick={copyInviteLink} className="px-4 py-2 rounded-full bg-black text-white text-xs font-semibold hover:bg-gray-800 transition">
              {copied ? "Copied!" : "Copy link"}
            </button>
            <button onClick={regenerateInviteLink} disabled={regenerating} className="px-4 py-2 rounded-full border border-gray-300 text-xs font-semibold text-gray-600 hover:bg-white transition disabled:opacity-50">
              {regenerating ? "Generating…" : "New link"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab("pending")} className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${tab === "pending" ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>
          Requests{pending.length > 0 ? ` (${pending.length})` : ""}
        </button>
        <button onClick={() => setTab("active")} className={`px-4 py-2 rounded-full text-xs font-semibold border transition ${tab === "active" ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-200"}`}>
          Members ({active.length})
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-gray-400">{tab === "pending" ? "No pending requests" : "No members yet"}</p>
      ) : (
        <div className="space-y-3">
          {list.map((m) => {
            const u = users[m.user_id];
            const name = u?.name ?? u?.email ?? "Member";
            return (
              <div key={m.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{name}</p>
                  <p className="text-xs text-gray-400">{u?.email ?? ""}{m.role !== "member" ? ` · ${m.role}` : ""}</p>
                </div>
                {actioningId === m.id ? (
                  <span className="text-xs text-gray-400">…</span>
                ) : tab === "pending" ? (
                  <div className="flex gap-2">
                    <button onClick={() => approve(m)} className="w-8 h-8 rounded-full bg-green-600 text-white text-sm hover:bg-green-700 transition">✓</button>
                    <button onClick={() => decline(m)} className="w-8 h-8 rounded-full bg-red-50 text-red-600 text-sm hover:bg-red-100 transition">✕</button>
                  </div>
                ) : m.role !== "owner" ? (
                  <button onClick={() => remove(m)} className="text-xs text-gray-400 hover:text-red-600 transition">Remove</button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
