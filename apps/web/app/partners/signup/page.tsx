// app/partners/signup/page.tsx
import Link from "next/link";

export default function GymSignupLanding() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
    <div className="max-w-7h-[70px]  w-full px-6 md:px-16 lg:px-24 xl:px-32  items-center= z-20  mx-auto px-6 py-12">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">
            Grow your business with FitPass
          </h1>
          <p className="text-m text-gray-600 mb-8 max-w-2xl mx-auto">
           Reach thousands of fitness and wellness enthusiasts in Nairobi and grow your business. Showcase your classes, attract new members, and help individuals, couples, and families train, play, and thrive anytime, anywhere — all through the city’s most flexible sports and wellness membership.
          </p>

           <div className="mx-auto w-full flex items-center justify-center gap-3 mt-4">
            <button 
                className="bg-slate-800 hover:bg-black text-white px-6 py-3 rounded-full font-medium transition">
                <Link href="/partner-signup">Become a Partner</Link>
            </button>
            <button className="flex items-center gap-2 border border-slate-300 hover:bg-slate-200/30 rounded-full px-6 py-3">
                <Link href="/partner-login">Already a Partner? Login</Link>
                <svg width="6" height="8" viewBox="0 0 6 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1.25.5 4.75 4l-3.5 3.5" stroke="#050040" stroke-opacity=".4" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
            </button>
        </div>
        </div>

        {/* Benefits */}
       
      
        <div className="grid md:grid-cols-3 text-center gap-8 mb-16">
          <div className="bg-white p-8 rounded-lg">
            <div className="text-4xl mb-4">📈</div>
            <h3 className="text-xl font-semibold mb-2">Grow Your Revenue</h3>
            <p className="text-sm/6 text-gray-600">
              FitPass connects your classes, sessions, and activities with active, high-intent members. Every booking we bring is incremental revenue for your business, filling slots that might otherwise go empty—so no opportunity is left on the table.
            </p>
          </div>

          <div className="bg-white p-8 rounded-lg">
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-xl font-semibold mb-2">Increase Revenue</h3>
            <p className=" text-sm/6 text-gray-600">
             FitPass only promotes your available capacity, leaving your loyal members’ favorite times untouched. Every extra reservation adds revenue without increasing your workload.
            </p>
          </div>

          <div className="text-sm/6 bg-white p-8 rounded-lg">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-xl font-semibold mb-2">Reach New Clients</h3>
            <p className="text-gray-600">
             Most FitPass users are new to the studios and activities they visit. That means more fresh faces in your classes, more memberships, and more opportunities to grow your client base.
            </p>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-lg mx-auto max-w-2xl p-10">
          <h2 className="text-3xl font-bold text-center mb-10">How It Works</h2>
          
          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="bg-indigo-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Create Your Account</h3>
                <p className="text-gray-600">Sign up and provide your business information</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-indigo-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Add Your Details</h3>
                <p className="text-gray-600">Upload photos, set your offerings, and schedule</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-indigo-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                3
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Get Approved</h3>
                <p className="text-gray-600">Our team reviews and approves your profile within 24-48 hours</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="bg-indigo-600 text-white w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0">
                4
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Go Live!</h3>
                <p className="text-gray-600">Start accepting bookings and growing your business</p>
              </div>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link href="/partner-signup">
              <button className="bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition">
                Get Started Now
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}