'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      // Revenue last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { data: bookings } = await supabase
        .from('bookings')
        .select('session_price, created_at')
        .gte('created_at', thirtyDaysAgo);

      const totalRevenue = bookings?.reduce((sum, b) => sum + (b.session_price ?? 0), 0) || 0;
      const totalBookings = bookings?.length || 0;
      const avgPayout = totalBookings > 0 ? totalRevenue / totalBookings : 0;

      const { count: totalSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true });

      setAnalytics({
        totalRevenue,
        totalBookings,
        avgPayout,
        totalSessions: totalSessions || 0,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Analytics - Last 30 Days</h1>

      <div className="grid grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Total Revenue</p>
          <p className="text-3xl font-bold">
            KES {analytics.totalRevenue.toLocaleString()}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Total Bookings</p>
          <p className="text-3xl font-bold">{analytics.totalBookings}</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Avg Payout</p>
          <p className="text-3xl font-bold">
            KES {Math.round(analytics.avgPayout).toLocaleString()}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <p className="text-sm text-gray-600 mb-1">Total Sessions</p>
          <p className="text-3xl font-bold">{analytics.totalSessions}</p>
        </div>
      </div>
    </div>
  );
}