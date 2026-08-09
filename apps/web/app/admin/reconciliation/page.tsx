"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type VenueMonth = {
  gym_id: string;
  gym_name: string;
  period: string; // "YYYY-MM"
  completed: number;
  no_shows: number;
  total_revenue: number;
  deposits_collected: number;
  remainder_expected: number;
};

type SummaryStats = {
  no_show_deposits: number;
  deposit_float: number;
  completed_volume: number;
  completed_revenue: number;
};

export default function ReconciliationPage() {
  const [rows, setRows] = useState<VenueMonth[]>([]);
  const [stats, setStats] = useState<SummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [periods, setPeriods] = useState<string[]>([]);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const [bookingsRes, gymRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("gym_id, status, booking_date, session_price, deposit_amount, remainder_amount, remainder_collected")
        .in("status", ["checked_in", "completed", "no_show", "deposit_paid"]),
      supabase.from("gyms").select("id, name"),
    ]);

    const bookings = bookingsRes.data ?? [];
    const gyms: Record<string, string> = {};
    for (const g of gymRes.data ?? []) gyms[g.id] = g.name;

    // Aggregate by gym_id × month
    const map = new Map<string, VenueMonth>();

    for (const b of bookings) {
      const month = (b.booking_date ?? "").slice(0, 7);
      if (!month) continue;
      const key = `${b.gym_id}__${month}`;
      if (!map.has(key)) {
        map.set(key, {
          gym_id: b.gym_id,
          gym_name: gyms[b.gym_id] ?? b.gym_id,
          period: month,
          completed: 0,
          no_shows: 0,
          total_revenue: 0,
          deposits_collected: 0,
          remainder_expected: 0,
        });
      }
      const row = map.get(key)!;
      const deposit = Number(b.deposit_amount ?? 0);
      const remainder = Number(b.remainder_amount ?? 0);
      const price = Number(b.session_price ?? 0);

      if (b.status === "no_show") {
        row.no_shows += 1;
        row.deposits_collected += deposit;
      } else if (b.status === "checked_in" || b.status === "completed") {
        row.completed += 1;
        row.deposits_collected += deposit;
        row.total_revenue += price;
        if (!b.remainder_collected) row.remainder_expected += remainder;
      }
    }

    const allRows = Array.from(map.values()).sort((a, b) =>
      b.period.localeCompare(a.period) || a.gym_name.localeCompare(b.gym_name)
    );
    setRows(allRows);

    const allPeriods = [...new Set(allRows.map((r) => r.period))].sort((a, b) => b.localeCompare(a));
    setPeriods(allPeriods);
    if (allPeriods.length && !allPeriods.includes(selectedPeriod)) {
      setSelectedPeriod(allPeriods[0]);
    }

    // Summary stats from all bookings
    const noShowDeposits = bookings
      .filter((b) => b.status === "no_show")
      .reduce((s, b) => s + Number(b.deposit_amount ?? 0), 0);
    const depositFloat = bookings
      .filter((b) => b.status === "deposit_paid")
      .reduce((s, b) => s + Number(b.deposit_amount ?? 0), 0);
    const completedVolume = bookings.filter((b) => b.status === "checked_in" || b.status === "completed").length;
    const completedRevenue = bookings
      .filter((b) => b.status === "checked_in" || b.status === "completed")
      .reduce((s, b) => s + Number(b.session_price ?? 0), 0);

    setStats({ no_show_deposits: noShowDeposits, deposit_float: depositFloat, completed_volume: completedVolume, completed_revenue: completedRevenue });
    setLoading(false);
  }

  const filtered = rows.filter((r) => r.period === selectedPeriod);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/admin" className="text-sm text-gray-400 hover:underline">← Admin</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Reconciliation</h1>
        </div>
        <select
          value={selectedPeriod}
          onChange={(e) => setSelectedPeriod(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
        >
          {periods.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <SummaryCard label="Completed sessions" value={stats.completed_volume.toString()} sub="all time" />
          <SummaryCard label="Total revenue" value={`KES ${stats.completed_revenue.toLocaleString()}`} sub="completed sessions" />
          <SummaryCard label="No-show deposits retained" value={`KES ${stats.no_show_deposits.toLocaleString()}`} sub="forfeited deposits" />
          <SummaryCard label="Deposit float" value={`KES ${stats.deposit_float.toLocaleString()}`} sub="pending payments" />
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">No completed bookings for {selectedPeriod}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-5 py-3 font-semibold text-gray-600">Venue</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Completed</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">No-shows</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Total revenue</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Deposits collected</th>
                <th className="text-right px-5 py-3 font-semibold text-gray-600">Remainder outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={`${r.gym_id}__${r.period}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-5 py-3 font-medium text-gray-900">{r.gym_name}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{r.completed}</td>
                  <td className="px-5 py-3 text-right text-red-600">{r.no_shows}</td>
                  <td className="px-5 py-3 text-right text-gray-900 font-medium">KES {r.total_revenue.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right text-gray-700">KES {r.deposits_collected.toLocaleString()}</td>
                  <td className="px-5 py-3 text-right">
                    {r.remainder_expected > 0 ? (
                      <span className="text-amber-700 font-medium">KES {r.remainder_expected.toLocaleString()}</span>
                    ) : (
                      <span className="text-green-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-gray-50 font-semibold">
                <td className="px-5 py-3 text-gray-900">Total</td>
                <td className="px-5 py-3 text-right">{filtered.reduce((s, r) => s + r.completed, 0)}</td>
                <td className="px-5 py-3 text-right text-red-600">{filtered.reduce((s, r) => s + r.no_shows, 0)}</td>
                <td className="px-5 py-3 text-right text-gray-900">KES {filtered.reduce((s, r) => s + r.total_revenue, 0).toLocaleString()}</td>
                <td className="px-5 py-3 text-right">KES {filtered.reduce((s, r) => s + r.deposits_collected, 0).toLocaleString()}</td>
                <td className="px-5 py-3 text-right text-amber-700">
                  KES {filtered.reduce((s, r) => s + r.remainder_expected, 0).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
    </div>
  );
}
