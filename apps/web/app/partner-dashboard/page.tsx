// ============================================
// FILE: app/partner-dashboard/page.tsx
// Partner dashboard with classes management
// ============================================
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Gym = {
  id: string;
  name: string;
  location: string;
  area: string;
  type: string;
  description: string;
  image_url: string;
  contact_email: string;
  contact_phone: string;
  is_active: boolean;
  latitude: number;
  longitude: number;
  rating: number;
  created_at: string;
};

type Session = {
  id: string;
  gym_id: string;
  name: string;
  description: string;
  time: string;
  date: string;
  duration_minutes: number;
  credits_required: number;
  max_capacity: number;
  spots_left: number;
  is_active: boolean;
  category: string;
  instructor: string;
  image_url: string;
};

export default function PartnerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [gym, setGym] = useState<Gym | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'info' | 'classes'>('info');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [showAddClass, setShowAddClass] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    area: "",
    type: "",
    description: "",
    image_url: "",
    contact_phone: "",
    latitude: 0,
    longitude: 0,
  });

  const [newSession, setNewSession] = useState({
    name: "",
    description: "",
    time: "",
    date: "",
    duration_minutes: 60,
    credits_required: 1,
    max_capacity: 20,
    category: "strength",
    instructor: "",
    image_url: "",
  });

  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const checkAuthAndFetchData = async () => {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        router.push('/login');
        return;
      }

      setUser(user);
      setEmailVerified(!!user.email_confirmed_at);

      // Fetch gym data
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .select('*')
        .eq('contact_email', user.email)
        .single();

      if (gymError) {
        console.error('Error fetching gym:', gymError);
      } else if (gymData) {
        setGym(gymData);
        setFormData({
          name: gymData.name,
          location: gymData.location,
          area: gymData.area,
          type: gymData.type,
          description: gymData.description,
          image_url: gymData.image_url,
          contact_phone: gymData.contact_phone,
          latitude: gymData.latitude,
          longitude: gymData.longitude,
        });

        // Fetch sessions for this gym
        await fetchSessions(gymData.id);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async (gymId: string) => {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .eq('gym_id', gymId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      console.error('Error fetching sessions:', error);
    } else {
      setSessions(data || []);
    }
  };

  const handleResendVerification = async () => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      });

      if (error) throw error;
      alert('Verification email sent! Please check your inbox.');
    } catch (error: any) {
      alert(error.message || 'Failed to send verification email');
    }
  };

  const handleSaveGymInfo = async () => {
    if (!gym) return;
    
    setSaving(true);
    try {
      const { error } = await supabase
        .from('gyms')
        .update({
          name: formData.name,
          location: formData.location,
          area: formData.area,
          type: formData.type,
          description: formData.description,
          image_url: formData.image_url,
          contact_phone: formData.contact_phone,
          latitude: formData.latitude,
          longitude: formData.longitude,
        })
        .eq('id', gym.id);

      if (error) throw error;

      await checkAuthAndFetchData();
      setEditMode(false);
      alert('Changes saved successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSession = async () => {
    if (!gym) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .insert({
          gym_id: gym.id,
          name: newSession.name,
          description: newSession.description,
          time: newSession.time,
          date: newSession.date,
          duration_minutes: newSession.duration_minutes,
          credits_required: newSession.credits_required,
          max_capacity: newSession.max_capacity,
          spots_left: newSession.max_capacity,
          category: newSession.category,
          instructor: newSession.instructor,
          image_url: newSession.image_url,
          is_active: true,
        });

      if (error) throw error;

      // Reset form
      setNewSession({
        name: "",
        description: "",
        time: "",
        date: "",
        duration_minutes: 60,
        credits_required: 1,
        max_capacity: 20,
        category: "strength",
        instructor: "",
        image_url: "",
      });
      setShowAddClass(false);
      await fetchSessions(gym.id);
      alert('Class added successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to add class');
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this class?')) return;

    try {
      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      if (gym) await fetchSessions(gym.id);
      alert('Class deleted successfully!');
    } catch (error: any) {
      alert(error.message || 'Failed to delete class');
    }
  };

  const handleToggleSessionStatus = async (sessionId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ is_active: !currentStatus })
        .eq('id', sessionId);

      if (error) throw error;

      if (gym) await fetchSessions(gym.id);
    } catch (error: any) {
      alert(error.message || 'Failed to update class status');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!gym) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
          <h2 className="text-2xl font-semibold mb-4">No Gym Found</h2>
          <p className="text-gray-600 mb-6">
            We couldn't find a gym associated with your account.
          </p>
          <Link href="/partner-signup">
            <button className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition">
              Register Your Gym
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Partner Dashboard</h1>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-800 underline"
          >
            Logout
          </button>
        </div>

        {/* Email Verification Alert */}
        {!emailVerified && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-800 mb-1">
                  ⚠️ Email Verification Required
                </h3>
                <p className="text-sm text-yellow-700 mb-2">
                  Please verify your email address to complete your account setup.
                </p>
                <button
                  onClick={handleResendVerification}
                  className="text-sm text-yellow-800 font-semibold underline hover:text-yellow-900"
                >
                  Resend Verification Email
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Approval Status */}
        <div className={`rounded-lg p-6 mb-6 ${
          gym.is_active 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-orange-50 border border-orange-200'
        }`}>
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-semibold mb-2">
                {gym.is_active ? '✅ Account Approved' : '⏳ Pending Approval'}
              </h2>
              <p className="text-sm text-gray-700">
                {gym.is_active 
                  ? 'Your gym is live and accepting bookings!'
                  : 'Your gym profile is under review. You can still add classes while waiting for approval.'}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-md mb-6">
          <div className="border-b border-gray-200">
            <div className="flex">
              <button
                onClick={() => setActiveTab('info')}
                className={`px-6 py-3 font-semibold text-sm ${
                  activeTab === 'info'
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Gym Information
              </button>
              <button
                onClick={() => setActiveTab('classes')}
                className={`px-6 py-3 font-semibold text-sm ${
                  activeTab === 'classes'
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                Classes ({sessions.length})
              </button>
            </div>
          </div>

          {/* Gym Information Tab */}
          {activeTab === 'info' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Gym Information</h2>
                {!editMode ? (
                  <button
                    onClick={() => setEditMode(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
                  >
                    Edit Details
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setEditMode(false);
                        setFormData({
                          name: gym.name,
                          location: gym.location,
                          area: gym.area,
                          type: gym.type,
                          description: gym.description,
                          image_url: gym.image_url,
                          contact_phone: gym.contact_phone,
                          latitude: gym.latitude,
                          longitude: gym.longitude,
                        });
                      }}
                      className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveGymInfo}
                      disabled={saving}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm disabled:bg-gray-400"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gym Name</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="text-gray-900">{gym.name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                  {editMode ? (
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({...formData, type: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="gym">Gym</option>
                      <option value="studio">Studio</option>
                      <option value="crossfit">CrossFit Box</option>
                      <option value="yoga">Yoga Studio</option>
                      <option value="pilates">Pilates Studio</option>
                      <option value="martial-arts">Martial Arts</option>
                    </select>
                  ) : (
                    <p className="text-gray-900 capitalize">{gym.type}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({...formData, location: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="text-gray-900">{gym.location}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Area</label>
                  {editMode ? (
                    <input
                      type="text"
                      value={formData.area}
                      onChange={(e) => setFormData({...formData, area: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="text-gray-900">{gym.area}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Email</label>
                  <p className="text-gray-900">{gym.contact_email}</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Contact Phone</label>
                  {editMode ? (
                    <input
                      type="tel"
                      value={formData.contact_phone}
                      onChange={(e) => setFormData({...formData, contact_phone: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="text-gray-900">{gym.contact_phone}</p>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  {editMode ? (
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  ) : (
                    <p className="text-gray-900">{gym.description}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Classes Tab */}
          {activeTab === 'classes' && (
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Classes</h2>
                <button
                  onClick={() => setShowAddClass(!showAddClass)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition text-sm"
                >
                  {showAddClass ? 'Cancel' : '+ Add Class'}
                </button>
              </div>

              {/* Add Class Form */}
              {showAddClass && (
                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                  <h3 className="font-semibold mb-4">Add New Class</h3>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Class Name</label>
                      <input
                        type="text"
                        value={newSession.name}
                        onChange={(e) => setNewSession({...newSession, name: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g., Morning Yoga"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Instructor</label>
                      <input
                        type="text"
                        value={newSession.instructor}
                        onChange={(e) => setNewSession({...newSession, instructor: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Instructor name"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                      <input
                        type="date"
                        value={newSession.date}
                        onChange={(e) => setNewSession({...newSession, date: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                      <input
                        type="time"
                        value={newSession.time}
                        onChange={(e) => setNewSession({...newSession, time: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Duration (minutes)</label>
                      <input
                        type="number"
                        value={newSession.duration_minutes}
                        onChange={(e) => setNewSession({...newSession, duration_minutes: parseInt(e.target.value)})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                      <select
                        value={newSession.category}
                        onChange={(e) => setNewSession({...newSession, category: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="strength">Strength</option>
                        <option value="cardio">Cardio</option>
                        <option value="yoga">Yoga</option>
                        <option value="pilates">Pilates</option>
                        <option value="crossfit">CrossFit</option>
                        <option value="martial-arts">Martial Arts</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Max Capacity</label>
                      <input
                        type="number"
                        value={newSession.max_capacity}
                        onChange={(e) => setNewSession({...newSession, max_capacity: parseInt(e.target.value)})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Credits Required</label>
                      <input
                        type="number"
                        value={newSession.credits_required}
                        onChange={(e) => setNewSession({...newSession, credits_required: parseInt(e.target.value)})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                      <textarea
                        value={newSession.description}
                        onChange={(e) => setNewSession({...newSession, description: e.target.value})}
                        rows={3}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="Class description..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Image URL (optional)</label>
                      <input
                        type="url"
                        value={newSession.image_url}
                        onChange={(e) => setNewSession({...newSession, image_url: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        placeholder="https://example.com/class-image.jpg"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleAddSession}
                    className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition"
                  >
                    Add Class
                  </button>
                </div>
              )}

              {/* Classes List */}
              {sessions.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-lg">
                  <p className="text-gray-500 mb-4">No classes added yet</p>
                  <button
                    onClick={() => setShowAddClass(true)}
                    className="text-indigo-600 hover:text-indigo-700 font-semibold"
                  >
                    Add your first class
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <div key={session.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900">{session.name}</h3>
                          <p className="text-sm text-gray-600 mb-2">{session.description}</p>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                            <span>👤 {session.instructor}</span>
                            <span>📅 {new Date(session.date).toLocaleDateString()}</span>
                            <span>🕒 {session.time}</span>
                            <span>⏱️ {session.duration_minutes} min</span>
                            <span>👥 {session.spots_left}/{session.max_capacity} spots</span>
                            <span className="px-2 py-1 bg-gray-100 rounded text-xs">{session.category}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <button
                            onClick={() => handleToggleSessionStatus(session.id, session.is_active)}
                            className={`px-3 py-1 rounded text-sm ${
                              session.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {session.is_active ? 'Active' : 'Inactive'}
                          </button>
                          <button
                            onClick={() => handleDeleteSession(session.id)}
                            className="text-red-600 hover:text-red-700 text-sm underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="font-semibold text-blue-900 mb-2">Need Help?</h3>
          <p className="text-sm text-blue-800 mb-3">
            If you have any questions or need assistance, please contact our support team.
          </p>
          <a
            href="mailto:support@fitpass.com"
            className="text-sm text-blue-600 hover:text-blue-700 font-semibold underline"
          >
            support@fitpass.com
          </a>
        </div>
      </div>
    </div>
  );
}