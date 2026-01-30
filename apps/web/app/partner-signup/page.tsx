// app/partner-signup/page.tsx
"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type FormData = {
  email: string;
  password: string;
  contactName: string;
  contactPhone: string;
  gymName: string;
  location: string;
  area: string;
  type: string;
  description: string;
  imageUrl: string;
  latitude: number;
  longitude: number;
};

export default function PartnerSignupPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    contactName: "",
    contactPhone: "",
    gymName: "",
    location: "",
    area: "",
    type: "gym",
    description: "",
    imageUrl: "",
    latitude: 0,
    longitude: 0,
  });

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);
    
    try {
      console.log("Starting signup process...");
      
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
      });

      console.log("Auth result:", { authData, authError });

      if (authError) throw authError;
      
      const userId = authData.user?.id;
      if (!userId) throw new Error("User creation failed");

      console.log("User created:", userId);

      // 2. Create gym entry
      const { data: gymData, error: gymError } = await supabase
        .from('gyms')
        .insert({
          name: formData.gymName,
          location: formData.location,
          area: formData.area,
          type: formData.type,
          rating: 0,
          image_url: formData.imageUrl,
          description: formData.description,
          contact_email: formData.email,
          contact_phone: formData.contactPhone,
          is_active: false,
          latitude: formData.latitude,
          longitude: formData.longitude,
        })
        .select()
        .single();

      console.log("Gym creation result:", { gymData, gymError });

      if (gymError) throw gymError;

      alert("Signup successful! Your gym is pending approval. Check your email to verify your account.");
      router.push('/partner-dashboard');
      
    } catch (error: any) {
      console.error('Signup error:', error);
      alert(error.message || "Signup failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold ${
                  s <= step ? 'bg-indigo-600 text-white' : 'bg-gray-300 text-gray-600'
                }`}
              >
                {s}
              </div>
            ))}
          </div>
          <div className="text-center text-sm text-gray-600 mt-2">
            {step === 1 && "Account Creation"}
            {step === 2 && "Business Details"}
            {step === 3 && "Offer & Availability"}
            {step === 4 && "Review"}
            {step === 5 && "Go Live"}
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-lg shadow-md p-8">
          
          {/* Step 1: Account Creation */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold mb-6">Create Your Account</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => updateFormData('email', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => updateFormData('password', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Name
                </label>
                <input
                  type="text"
                  value={formData.contactName}
                  onChange={(e) => updateFormData('contactName', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contactPhone}
                  onChange={(e) => updateFormData('contactPhone', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>
            </div>
          )}

          {/* Step 2: Business Details */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold mb-6">Business Details</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Gym/Studio Name
                </label>
                <input
                  type="text"
                  value={formData.gymName}
                  onChange={(e) => updateFormData('gymName', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => updateFormData('location', e.target.value)}
                  placeholder="e.g., 123 Main St, City, State"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Area
                </label>
                <input
                  type="text"
                  value={formData.area}
                  onChange={(e) => updateFormData('area', e.target.value)}
                  placeholder="e.g., Downtown, North Side"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => updateFormData('type', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="gym">Gym</option>
                  <option value="studio">Studio</option>
                  <option value="crossfit">CrossFit Box</option>
                  <option value="yoga">Yoga Studio</option>
                  <option value="pilates">Pilates Studio</option>
                  <option value="martial-arts">Martial Arts</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => updateFormData('description', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Tell us about your gym..."
                />
              </div>
            </div>
          )}

          {/* Step 3: Offer & Availability */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold mb-6">Offer & Availability</h2>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image URL
                </label>
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => updateFormData('imageUrl', e.target.value)}
                  placeholder="https://example.com/gym-image.jpg"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">Upload your image to a service like Imgur or use a direct link</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Latitude
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.latitude}
                  onChange={(e) => updateFormData('latitude', parseFloat(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Longitude
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={formData.longitude}
                  onChange={(e) => updateFormData('longitude', parseFloat(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm text-blue-800">
                  💡 Tip: You can find your gym's coordinates using Google Maps. Right-click on your location and select the coordinates to copy them.
                </p>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-2xl font-semibold mb-6">Review Your Information</h2>
              
              <div className="space-y-4">
                <div className="border-b pb-4">
                  <h3 className="font-semibold text-gray-700 mb-2">Account Details</h3>
                  <p className="text-sm text-gray-600">Email: {formData.email}</p>
                  <p className="text-sm text-gray-600">Contact: {formData.contactName}</p>
                  <p className="text-sm text-gray-600">Phone: {formData.contactPhone}</p>
                </div>

                <div className="border-b pb-4">
                  <h3 className="font-semibold text-gray-700 mb-2">Business Details</h3>
                  <p className="text-sm text-gray-600">Name: {formData.gymName}</p>
                  <p className="text-sm text-gray-600">Type: {formData.type}</p>
                  <p className="text-sm text-gray-600">Location: {formData.location}</p>
                  <p className="text-sm text-gray-600">Area: {formData.area}</p>
                  <p className="text-sm text-gray-600">Description: {formData.description}</p>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-700 mb-2">Location Coordinates</h3>
                  <p className="text-sm text-gray-600">Latitude: {formData.latitude}</p>
                  <p className="text-sm text-gray-600">Longitude: {formData.longitude}</p>
                </div>
              </div>

              <button
                onClick={() => setStep(2)}
                className="text-sm text-indigo-600 hover:text-indigo-700 underline"
              >
                Edit Information
              </button>
            </div>
          )}

          {/* Step 5: Go Live */}
          {step === 5 && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-semibold">Ready to Go Live!</h2>
              <p className="text-gray-600">
                Your gym profile will be reviewed by our team. Once approved, you'll be able to start accepting bookings.
              </p>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⏱️ Approval typically takes 24-48 hours. We'll send you an email once your gym is approved.
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:bg-gray-400"
              >
                {loading ? "Creating Account..." : "Complete Signup"}
              </button>
            </div>
          )}

          {/* Navigation Buttons */}
          {step < 5 && (
            <div className="flex justify-between mt-8">
              <button
                onClick={handleBack}
                disabled={step === 1}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>
              
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}