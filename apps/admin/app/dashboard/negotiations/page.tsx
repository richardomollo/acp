'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

export default function NegotiationsPage() {
  const [negotiations, setNegotiations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  useEffect(() => {
    loadNegotiations();
  }, []);

  async function loadNegotiations() {
    try {
      const { data, error } = await supabase
        .from('rate_floor_negotiations')
        .select(`
          *,
          gyms (name, drop_in_price, location),
          partners (business_name, email)
        `)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      setNegotiations(data || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id: string, gymId: string, amount: number, percentage: number) {
    if (!confirm('Approve this rate floor proposal?')) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();

      console.log('🔍 Approving negotiation:', { id, gymId, amount, percentage });

      // Step 1: Update negotiation status
      const { error: negotiationError } = await supabase
        .from('rate_floor_negotiations')
        .update({
          status: 'approved',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq('id', id);

      if (negotiationError) {
        console.error('❌ Negotiation update error:', negotiationError);
        throw negotiationError;
      }

      console.log('✅ Negotiation updated');

      // Step 2: Update gym with rate floor
      const { error: gymError } = await supabase
        .from('gyms')
        .update({
          rate_floor: amount,
          rate_floor_percentage: percentage,
        })
        .eq('id', gymId);

      if (gymError) {
        console.error('❌ Gym update error:', gymError);
        throw gymError;
      }

      console.log('✅ Gym updated');

      alert('✅ Approved successfully!');
      
      // Reload negotiations
      await loadNegotiations();
    } catch (error: any) {
      console.error('❌ Approval error:', error);
      alert(`Error approving: ${error.message}`);
    }
  }

  async function handleReject() {
    if (!selectedId || !rejectReason.trim()) {
      alert('Please provide a reason');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from('rate_floor_negotiations')
        .update({
          status: 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
          notes: rejectReason, // Store rejection reason in notes
        })
        .eq('id', selectedId);

      if (error) {
        console.error('❌ Rejection error:', error);
        throw error;
      }

      alert('❌ Rejected successfully');
      setShowRejectDialog(false);
      setRejectReason('');
      setSelectedId(null);
      
      // Reload negotiations
      await loadNegotiations();
    } catch (error: any) {
      console.error('❌ Rejection error:', error);
      alert(`Error rejecting: ${error.message}`);
    }
  }

  function getTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60,
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
      }
    }
    return 'just now';
  }

  if (loading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Rate Floor Negotiations</h1>
        <p className="text-gray-600">{negotiations.length} pending approvals</p>
      </div>

      <div className="space-y-4">
        {negotiations.map((neg) => {
          const gym = neg.gyms;
          const partner = neg.partners;
          const floorPercentage = neg.proposed_percentage || 
            ((neg.proposed_floor / gym.drop_in_price) * 100);
          const isHigh = floorPercentage > 85;

          return (
            <div key={neg.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-xl font-bold">{gym.name}</h3>
                    {isHigh && (
                      <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-semibold">
                        High Floor
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-600 mb-4">{gym.location}</p>

                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600">Drop-in Price</p>
                      <p className="text-lg font-bold">
                        KES {gym.drop_in_price?.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Proposed Floor</p>
                      <p className="text-lg font-bold text-blue-600">
                        KES {neg.proposed_floor?.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Percentage</p>
                      <p className="text-lg font-bold">
                        {Math.round(floorPercentage)}%
                      </p>
                    </div>
                  </div>

                  {neg.notes && (
                    <div className="bg-gray-50 p-3 rounded mb-4">
                      <p className="text-sm font-semibold mb-1">Notes:</p>
                      <p className="text-sm text-gray-700">{neg.notes}</p>
                    </div>
                  )}

                  <div className="text-sm text-gray-500">
                    Partner: {partner.business_name || 'Unknown'} ({partner.email})
                    <br />
                    Submitted {getTimeAgo(neg.submitted_at)}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button
                    onClick={() => handleApprove(neg.id, neg.gym_id, neg.proposed_floor, floorPercentage)}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-semibold"
                  >
                    ✓ Approve
                  </button>
                  <button
                    onClick={() => {
                      setSelectedId(neg.id);
                      setShowRejectDialog(true);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-semibold"
                  >
                    ✗ Reject
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {negotiations.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">No pending negotiations</p>
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">Reject Proposal</h3>
            <label className="block text-sm font-medium mb-2">
              Rejection Reason
            </label>
            <input
              type="text"
              className="w-full px-4 py-2 border border-gray-300 rounded-md mb-4 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="e.g., Floor too high, please revise to 80%"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowRejectDialog(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md font-semibold"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}