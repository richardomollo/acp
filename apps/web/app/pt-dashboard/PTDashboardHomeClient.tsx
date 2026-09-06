"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Booking = {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  status: string;
  amount_kes: number | null;
  users: { full_name: string; email: string } | null;
  pt_offerings: { title: string; duration_minutes: number } | null;
};

type Stats = {
  monthSessions: number;
  monthEarnings: number;
  pendingCount: number;
};

export default function PTDashboardPage() {
  const router = useRouter();
  const [ptName, setPtName] = useState("");
  const [loading, setLoading] = useState(true);
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [stats, setStats] = useState<Stats>({ monthSessions: 0, monthEarnings: 0, pendingCount: 0 });

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-KE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadData() {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/partner-login");
      return;
    }

    // Fetch PT profile
    const { data: pt } = await supabase
      .from("personal_trainers")
      .select("id, full_name, professional_name")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pt) {
      router.push("/partner-login");
      return;
    }

    setPtName(pt.professional_name || pt.full_name || "Trainer");
    const ptId = pt.id;
    const todayStr = today.toISOString().slice(0, 10);

    // Fetch upcoming bookings (pending + confirmed, date >= today, limit 5)
    const { data: upcoming } = await supabase
      .from("pt_bookings")
      .select(
        "id, scheduled_date, scheduled_time, status, amount_kes, users(full_name, email), pt_offerings(title, duration_minutes)"
      )
      .eq("pt_id", ptId)
      .in("status", ["pending", "confirmed"])
      .gte("scheduled_date", todayStr)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })
      .limit(5);

    setUpcomingBookings((upcoming as unknown as Booking[]) ?? []);

    // Stats: completed this month
    const { data: completedMonth } = await supabase
      .from("pt_bookings")
      .select("id, amount_kes")
      .eq("pt_id", ptId)
      .eq("status", "completed")
      .gte("scheduled_date", monthStart);

    const monthSessions = completedMonth?.length ?? 0;
    const monthEarnings = (completedMonth ?? []).reduce((sum, b) => {
      const gross = b.amount_kes ?? 0;
      return sum + gross * 0.85;
    }, 0);

    // Pending count
    const { count: pendingCount } = await supabase
      .from("pt_bookings")
      .select("id", { count: "exact", head: true })
      .eq("pt_id", ptId)
      .eq("status", "pending");

    setStats({ monthSessions, monthEarnings, pendingCount: pendingCount ?? 0 });
    setLoading(false);
  }

  function statusBadge(status: string) {
    const map: Record<string, string> = {
      pending: "bg-amber-100 text-amber-700",
      confirmed: "bg-green-100 text-green-700",
      completed: "bg-blue-100 text-blue-700",
      cancelled: "bg-gray-100 text-gray-500",
      no_show: "bg-gray-100 text-gray-500",
    };
    return map[status] ?? "bg-gray-100 text-gray-500";
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function formatTime(timeStr: string) {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour % 12 || 12;
    return `${display}:${m} ${ampm}`;
  }

  const quickActions = [
    { label: "New Offering", href: "/pt-dashboard/offerings", desc: "Add a session type", icon: "+" },
    { label: "All Bookings", href: "/pt-dashboard/bookings", desc: "View & manage", icon: "📅" },
    { label: "Edit Profile", href: "/pt-dashboard/profile", desc: "Update your info", icon: "✏️" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500 text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Greeting */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {ptName}</h1>
        <p className="text-gray-500 text-sm mt-1">{dateLabel}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
            This Month Sessions
          </p>
          <p className="text-3xl font-bold text-gray-900">{stats.monthSessions}</p>
          <p className="text-xs text-gray-400 mt-1">Completed</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
            Month Earnings
          </p>
          <p className="text-3xl font-bold text-gray-900">
            KES {stats.monthEarnings.toLocaleString("en-KE", { maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-gray-400 mt-1">After 15% platform fee</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-2">
            Pending to Confirm
          </p>
          <p className="text-3xl font-bold text-amber-600">{stats.pendingCount}</p>
          <p className="text-xs text-gray-400 mt-1">Awaiting your response</p>
        </div>
      </div>

      {/* Upcoming sessions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Upcoming Sessions</h2>
          <Link
            href="/pt-dashboard/bookings"
            className="text-xs text-blue-500 hover:text-blue-600 font-medium"
          >
            View all
          </Link>
        </div>
        {upcomingBookings.length === 0 ? (
          <div className="px-6 py-10 text-center text-gray-400 text-sm">
            No upcoming sessions. Share your offerings to get bookings!
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {upcomingBookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-6 py-4 gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Date chip */}
                  <div className="flex-shrink-0 w-12 text-center">
                    <p className="text-xs text-gray-400">
                      {new Date(b.scheduled_date + "T00:00:00").toLocaleDateString("en-KE", {
                        month: "short",
                      })}
                    </p>
                    <p className="text-lg font-bold text-gray-900 leading-none">
                      {new Date(b.scheduled_date + "T00:00:00").getDate()}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {b.pt_offerings?.title ?? "Session"}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {b.users?.full_name ?? "Client"} &middot; {formatTime(b.scheduled_time)}
                      {b.pt_offerings?.duration_minutes
                        ? ` · ${b.pt_offerings.duration_minutes} min`
                        : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusBadge(b.status)}`}
                >
                  {b.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow group"
            >
              <div className="text-2xl mb-3">{action.icon}</div>
              <p className="text-sm font-semibold text-gray-900 group-hover:text-black">
                {action.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{action.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
