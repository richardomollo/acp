import GoogleLogin from "../components/auth/GoogleLogin";
import EmailAuth from "../components/auth/EmailAuth";

export default function LoginPage() {
  return (
    <div className="max-w-7h-[70px]  w-full px-6 md:px-16 lg:px-24 xl:px-32  items-center= z-20  mx-auto px-6 py-12">

      <div className="relative isolate bg-white px-6 py-24 sm:py-32 lg:px-8">
 
  <div className="mx-auto max-w-4xl text-center">
    <h2 className="text-base/7 font-semibold text-gray-900">Quick Recarp</h2>
    <p className="mt-2 text-5xl font-semibold tracking-tight text-balance text-gray-900 sm:text-6xl">Free for 1 month</p>
  </div>
  <p className="mx-auto mt-6 max-w-2xl text-center text-sm ext-base/7 text-pretty text-gray-600">Your first month is on us! 💪 Try activities for individuals, partners, kids, and families — train, play, and unwind anytime with gyms, classes, and wellness experiences on Lana Health. Free for 1 month. Start today!</p>
  <div className="mx-auto mt-16 grid max-w-lg grid-cols-1 items-center gap-y-6 sm:mt-20 sm:gap-y-0 lg:max-w-4xl lg:grid-cols-2">
    <div className="rounded-3xl rounded-t-3xl bg-white/60 p-8 ring-1 ring-gray-900/10 sm:mx-8 sm:rounded-b-none sm:p-10 lg:mx-0 lg:rounded-tr-none lg:rounded-bl-3xl">
      
      
      <p className="mt-6 text-base/7 text-gray-600">The perfect plan if you're just getting started with our product.</p>
      <ul role="list" className="mt-8 space-y-3 text-sm/6 text-gray-600 sm:mt-10">
        <li className="flex gap-x-3">
          <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" className="h-6 w-5 flex-none text-indigo-600">
            <path d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" fill-rule="evenodd" />
          </svg>
          Get 47 credits to visit a selection of our best studios & gyms one time each.
        </li>
        <li className="flex gap-x-3">
          <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" className="h-6 w-5 flex-none text-indigo-600">
            <path d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" fill-rule="evenodd" />
          </svg>
          Credits expire at the end of your trial.
        </li>
        <li className="flex gap-x-3">
          <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" className="h-6 w-5 flex-none text-indigo-600">
            <path d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" fill-rule="evenodd" />
          </svg>
          We’ll send you an email reminder before your trial ends. Cancel anytime.
        </li>
        <li className="flex gap-x-3">
          <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" className="h-6 w-5 flex-none text-indigo-600">
            <path d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clip-rule="evenodd" fill-rule="evenodd" />
          </svg>
          Upgrade anytime to unlock access to fitness classes, gyms, children activities & spas as well as repeat bookings.
        </li>
      </ul>
      
    </div>
    <div className="relative rounded-3xl  p-8 shadow-2xl ring-1 ring-gray-900/10 sm:p-10">
      <div className="mt-20 space-y-6 max-w-sm mb-25">
             <EmailAuth />
            <div className="text-center text-sm text-gray-400">or</div>
            <GoogleLogin />
      </div>
    </div>
  </div>
</div>
    </div>
  );
}
