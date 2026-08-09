"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type AppUser = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

type Partner = {
  id: string;
  name: string;
  contact_email: string | null;
  location: string | null;
  type: string | null;
  created_at: string;
};

type RefundRecord = {
  id: string;
  booking_id: string;
  payment_provider: string;
  provider_reference: string | null;
  amount: number;
  status: string;
  notes: string | null;
  processed_by: string | null;
  created_at: string;
  completed_at: string | null;
  bookings?: {
    id: string;
    status: string;
    cancelled_by: string | null;
    booking_date: string;
    user_id: string | null;
    guest_email: string | null;
    sessions?: { name: string; date: string; time: string } | null;
    gyms?: { name: string } | null;
  } | null;
};

type Tab = "users" | "partners" | "cancellations";

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });

function refundStatusBadge(status: string) {
  switch (status) {
    case "pending":    return "bg-yellow-50 text-yellow-700";
    case "processing": return "bg-blue-50 text-blue-700";
    case "completed":  return "bg-green-50 text-green-700";
    case "failed":     return "bg-red-50 text-red-600";
    default:           return "bg-gray-100 text-gray-500";
  }
}

export default function AdminPage() {
  const [tab, setTab]         = useState<Tab>("users");
  const [users, setUsers]     = useState<AppUser[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [refunds, setRefunds] = useState<RefundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken]     = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Refund action state
  const [updatingRefund, setUpdatingRefund] = useState<string | null>(null);
  const [refundRef, setRefundRef]           = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [usersRes, partnersRes, refundsRes] = await Promise.all([
      supabase
        .from("users")
        .select("id, name, email, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("gyms")
        .select("id, name, contact_email, location, type, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("refund_transactions")
        .select(`
          *,
          bookings!left(
            id, status, cancelled_by, booking_date, user_id, guest_email,
            sessions!left(name, date, time),
            gyms!left(name)
          )
        `)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    setUsers(usersRes.data ?? []);
    setPartners(partnersRes.data ?? []);
    setRefunds(refundsRes.data ?? []);
    setLoading(false);
  }

  async function handleDelete(id: string, type: "user" | "partner") {
    if (!token) return;
    setDeleting(id);
    setConfirmId(null);
    try {
      const res = await fetch("/api/admin/delete-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: id, type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      if (type === "user") setUsers((prev) => prev.filter((u) => u.id !== id));
      else setPartners((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert("Delete failed: " + err.message);
    } finally {
      setDeleting(null);
    }
  }

  async function handleRefundUpdate(refundId: string, newStatus: string) {
    if (!token) return;
    setUpdatingRefund(refundId);
    const providerRef = refundRef[refundId]?.trim();
    try {
      const res = await fetch("/api/admin/refunds", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          refundId,
          status: newStatus,
          ...(providerRef ? { providerReference: providerRef } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setRefunds(prev => prev.map(r => r.id === refundId ? { ...r, ...json.refund } : r));
      setRefundRef(prev => { const next = { ...prev }; delete next[refundId]; return next; });
    } catch (err: any) {
      alert("Update failed: " + err.message);
    } finally {
      setUpdatingRefund(null);
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const filteredPartners = partners.filter(
    (p) =>
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.contact_email?.toLowerCase().includes(search.toLowerCase())
  );

  const pendingRefunds    = refunds.filter(r => r.status === "pending" || r.status === "processing");
  const completedRefunds  = refunds.filter(r => r.status === "completed" || r.status === "failed");

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Panel</h1>
        <p className="text-sm text-gray-500 mt-1">Manage users, partner venues, and refunds</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Users</p>
          <p className="text-3xl font-bold text-gray-900">{users.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Partners</p>
          <p className="text-3xl font-bold text-gray-900">{partners.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pending Refunds</p>
          <p className={`text-3xl font-bold ${pendingRefunds.length > 0 ? "text-yellow-600" : "text-gray-900"}`}>
            {pendingRefunds.length}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
        {(["users", "partners", "cancellations"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setSearch(""); setConfirmId(null); }}
            className={`px-5 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === t ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t === "users"         && `Users (${users.length})`}
            {t === "partners"      && `Partners (${partners.length})`}
            {t === "cancellations" && `Refunds${pendingRefunds.length > 0 ? ` (${pendingRefunds.length})` : ""}`}
          </button>
        ))}
      </div>

      {tab !== "cancellations" && (
        <input
          type="text"
          placeholder={`Search ${tab}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-sm mb-4 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
      )}

      {loading ? (
        <p className="text-gray-400 py-12 text-center">Loading…</p>
      ) : (
        <>
          {/* Users */}
          {tab === "users" && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Name</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Email</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Joined</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-gray-400 py-10">No users found</td></tr>
                  ) : filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{u.name || "—"}</td>
                      <td className="px-5 py-3.5 text-gray-500">{u.email}</td>
                      <td className="px-5 py-3.5 text-gray-400">{fmtDate(u.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        {confirmId === u.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-gray-500">Are you sure?</span>
                            <button onClick={() => handleDelete(u.id, "user")} disabled={deleting === u.id}
                              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition">
                              {deleting === u.id ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button onClick={() => setConfirmId(null)}
                              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmId(u.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition">
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Partners */}
          {tab === "partners" && (
            <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Venue</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Email</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Location</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Type</th>
                    <th className="text-left px-5 py-3 font-medium text-gray-500">Added</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredPartners.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-gray-400 py-10">No partners found</td></tr>
                  ) : filteredPartners.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3.5 font-medium text-gray-900">{p.name}</td>
                      <td className="px-5 py-3.5 text-gray-500">{p.contact_email || "—"}</td>
                      <td className="px-5 py-3.5 text-gray-500">{p.location || "—"}</td>
                      <td className="px-5 py-3.5">
                        {p.type ? (
                          <span className="bg-gray-100 text-gray-600 text-xs font-medium px-2 py-0.5 rounded-full capitalize">
                            {p.type}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-gray-400">{fmtDate(p.created_at)}</td>
                      <td className="px-5 py-3.5 text-right">
                        {confirmId === p.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-xs text-gray-500">Are you sure?</span>
                            <button onClick={() => handleDelete(p.id, "partner")} disabled={deleting === p.id}
                              className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition">
                              {deleting === p.id ? "Deleting…" : "Yes, delete"}
                            </button>
                            <button onClick={() => setConfirmId(null)}
                              className="text-xs text-gray-500 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmId(p.id)}
                            className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition">
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cancellations / Refunds */}
          {tab === "cancellations" && (
            <div className="space-y-6">
              {/* Pending & in-progress refunds */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">Pending refunds</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Process via M-Pesa B2C or bank transfer, then mark as completed.
                    </p>
                  </div>
                  <button onClick={fetchAll} className="text-xs text-gray-500 hover:text-gray-700 font-medium border border-gray-200 px-3 py-1.5 rounded-lg transition">
                    Refresh
                  </button>
                </div>
                {pendingRefunds.length === 0 ? (
                  <div className="px-5 py-10 text-center text-sm text-gray-400">No pending refunds.</div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {pendingRefunds.map((r) => (
                      <div key={r.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${refundStatusBadge(r.status)}`}>
                                {r.status}
                              </span>
                              <span className="text-sm font-bold text-gray-900">
                                KES {Number(r.amount).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700">
                              {r.bookings?.sessions?.name ?? "Session"}{" "}
                              {r.bookings?.sessions?.date ? `· ${fmtDate(r.bookings.sessions.date)}` : ""}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {r.bookings?.gyms?.name ?? ""}
                              {r.bookings?.cancelled_by ? ` · Cancelled by ${r.bookings.cancelled_by}` : ""}
                            </p>
                            {r.notes && (
                              <p className="text-xs text-gray-400 mt-1 italic">{r.notes}</p>
                            )}
                            <p className="text-xs text-gray-300 mt-1">{fmtDate(r.created_at)}</p>
                          </div>

                          <div className="flex flex-col gap-2 flex-shrink-0 min-w-[200px]">
                            <input
                              type="text"
                              placeholder="M-Pesa ref (optional)"
                              value={refundRef[r.id] ?? ""}
                              onChange={(e) => setRefundRef(prev => ({ ...prev, [r.id]: e.target.value }))}
                              className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900"
                            />
                            <div className="flex gap-2">
                              {r.status === "pending" && (
                                <button
                                  onClick={() => handleRefundUpdate(r.id, "processing")}
                                  disabled={updatingRefund === r.id}
                                  className="flex-1 text-xs py-1.5 bg-blue-50 text-blue-700 font-semibold rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
                                >
                                  Processing
                                </button>
                              )}
                              <button
                                onClick={() => handleRefundUpdate(r.id, "completed")}
                                disabled={updatingRefund === r.id}
                                className="flex-1 text-xs py-1.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                              >
                                {updatingRefund === r.id ? "…" : "Mark done"}
                              </button>
                              <button
                                onClick={() => handleRefundUpdate(r.id, "failed")}
                                disabled={updatingRefund === r.id}
                                className="flex-1 text-xs py-1.5 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                              >
                                Failed
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Completed / failed refunds */}
              {completedRefunds.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100">
                    <h2 className="font-semibold text-gray-900">Completed refunds</h2>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {completedRefunds.map((r) => (
                      <div key={r.id} className="px-5 py-3.5 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {r.bookings?.sessions?.name ?? "Session"}
                            {r.bookings?.sessions?.date ? ` · ${fmtDate(r.bookings.sessions.date)}` : ""}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {r.bookings?.gyms?.name ?? ""}
                            {r.provider_reference ? ` · Ref: ${r.provider_reference}` : ""}
                            {r.processed_by ? ` · by ${r.processed_by}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className="text-sm font-bold text-gray-900">
                            KES {Number(r.amount).toLocaleString()}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${refundStatusBadge(r.status)}`}>
                            {r.status}
                          </span>
                          <span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
