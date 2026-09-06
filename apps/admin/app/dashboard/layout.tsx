
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/login');
    } else {
      setUser(user);
      setLoading(false);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  const nav = [
    { name: '💰 Finance', href: '/dashboard/finance' },
    { name: '📋 Negotiations', href: '/dashboard/negotiations' },
    { name: '📊 Analytics', href: '/dashboard/analytics' },
    { name: '💰 Wallets', href: '/dashboard/wallets' },
    { name: '🏢 Venues', href: '/dashboard/venues' },
    { name: '📅 Sessions', href: '/dashboard/sessions' },
    { name: '🎟️ Experiences', href: '/dashboard/experiences' },
    { name: '🥗 Meals', href: '/dashboard/meals' },
    { name: '👥 Partners', href: '/dashboard/partners' },
    { name: '🧑‍💻 Users', href: '/dashboard/users' },
    { name: '🏋️ Trainers', href: '/dashboard/trainers' },
    { name: '🏃 Communities', href: '/dashboard/communities' },
    { name: '🏷️ Categories', href: '/dashboard/categories' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">⚡ Lana Admin</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-blue-600 hover:underline"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white border-r border-gray-200 min-h-screen p-6">
          <nav className="space-y-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-4 py-2 rounded-lg transition-colors ${
                  pathname === item.href
                    ? 'bg-blue-50 text-blue-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
