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
        .select('credits_used, created_at')
        .gte('created_at', thirtyDaysAgo);

      const totalRevenue = bookings?.reduce((sum, b) => sum + (b.credits_used * 200), 0) || 0;
      const totalBookings = bookings?.length || 0;
      const avgPayout = totalBookings > 0 ? totalRevenue / totalBookings : 0;

      // Sessions with SmartRate
      const { count: smartRateCount } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true })
        .not('base_credits', 'is', null);

      const { count: totalSessions } = await supabase
        .from('sessions')
        .select('*', { count: 'exact', head: true });

      setAnalytics({
        totalRevenue,
        totalBookings,
        avgPayout,
        smartRateCount: smartRateCount || 0,
        totalSessions: totalSessions || 0,
        smartRatePercentage: totalSessions ? ((smartRateCount || 0) / totalSessions) * 100 : 0,
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
          <p className="text-sm text-gray-600 mb-1">SmartRate Adoption</p>
          <p className="text-3xl font-bold">
            {Math.round(analytics.smartRatePercentage)}%
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {analytics.smartRateCount} of {analytics.totalSessions} sessions
          </p>
        </div>
      </div>
    </div>
  );
}