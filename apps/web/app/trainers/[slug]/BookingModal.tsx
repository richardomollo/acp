"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Offering = {
  id: string;
  title: string;
  type: string | null;
  duration_minutes: number | null;
  price_kes: number | null;
  max_participants: number | null;
  description?: string | null;
  service_zones?: string[] | null;
  is_programme?: boolean;
  intro_price_kes?: number | null;
};

type PT = {
  id: string;
  full_name: string;
  professional_name?: string | null;
  training_locations?: string[] | null;
};

type Availability = { day_of_week: number; start_time: string; end_time: string };
type Step = "date" | "time" | "location" | "address" | "confirmed";

function generateSlots(start: string, end: string, duration: number): string[] {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  const slots: string[] = [];
  for (let m = startM; m + duration <= endM; m += duration) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return slots;
}

function fmtTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-KE", {
    weekday: "long", month: "long", day: "numeric",
  });
}

export default function BookingModal({
  pt,
  offering,
  onClose,
  onConfirmed,
}: {
  pt: PT;
  offering: Offering;
  onClose: () => void;
  onConfirmed?: (bookingId: string) => void;
}) {
  const router = useRouter();
  const displayName = pt.professional_name ?? pt.full_name;
  const offeringType = (offering.type ?? "1-on-1").split(",")[0];
  const duration = offering.duration_minutes ?? 60;
  // For programme intros, use intro_price_kes
  const effectivePrice = offering.is_programme
    ? (offering.intro_price_kes ?? offering.price_kes)
    : offering.price_kes;
  const isFree = (effectivePrice ?? 0) === 0;

  const needsLocationPick = offeringType === "1-on-1" && (pt.training_locations?.length ?? 0) > 0;
  const needsAddressInput = offeringType === "home-visit";

  const [step, setStep] = useState<Step>("date");
  const [loadingData, setLoadingData] = useState(true);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [locationPref, setLocationPref] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [offeringAvailRes, globalAvailRes, blockedRes] = await Promise.all([
        supabase.from("pt_availability").select("day_of_week, start_time, end_time")
          .eq("pt_id", pt.id).eq("offering_id", offering.id),
        supabase.from("pt_availability").select("day_of_week, start_time, end_time")
          .eq("pt_id", pt.id).is("offering_id", null),
        supabase.from("pt_blocked_dates").select("date").eq("pt_id", pt.id),
      ]);
      const offeringAvail = offeringAvailRes.data ?? [];
      setAvailability(offeringAvail.length > 0 ? offeringAvail : (globalAvailRes.data ?? []));
      setBlockedDates(new Set((blockedRes.data ?? []).map((r: any) => r.date)));
      setLoadingData(false);
    })();
  }, [pt.id, offering.id]);

  const calendarDays = (() => {
    const days: { date: string; dow: number; available: boolean }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 28; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);
      const jsDow = d.getDay();
      const ptDow = jsDow === 0 ? 6 : jsDow - 1;
      const hasAvail = availability.some((a) => a.day_of_week === ptDow);
      days.push({ date: dateStr, dow: ptDow, available: hasAvail && !blockedDates.has(dateStr) });
    }
    return days;
  })();

  const timeSlots = (() => {
    if (!selectedDate) return [];
    const d = new Date(selectedDate + "T00:00:00");
    const jsDow = d.getDay();
    const ptDow = jsDow === 0 ? 6 : jsDow - 1;
    return availability
      .filter((a) => a.day_of_week === ptDow)
      .flatMap((a) => generateSlots(a.start_time, a.end_time, duration));
  })();

  const proceedFromLastStep = async () => {
    if (!selectedDate || !selectedTime) return;

    if (isFree) {
      // Free sessions are booked directly — no checkout needed
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/pt-booking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pt_id: pt.id,
            offering_id: offering.id,
            scheduled_date: selectedDate,
            scheduled_time: selectedTime,
            location_type: locationPref || offeringType,
            client_address: needsAddressInput ? clientAddress : null,
            payment_method: "free",
            amount_kes: 0,
            payment_status: "paid",
            status: "confirmed",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Booking failed.");
        onConfirmed?.(json.booking.id);
        setStep("confirmed");
      } catch (e: any) {
        setError(e.message ?? "Something went wrong. Please try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Paid: redirect to unified checkout page
    const params = new URLSearchParams({
      type: "pt",
      ptId: pt.id,
      offeringId: offering.id,
      date: selectedDate,
      time: selectedTime,
    });
    if (locationPref) params.set("location", locationPref);
    if (clientAddress) params.set("address", clientAddress);
    if (offering.is_programme) params.set("programmeId", offering.id);
    onClose();
    router.push(`/checkout?${params.toString()}`);
  };

  const handleContinue = () => {
    if (step === "date") { if (selectedDate) setStep("time"); }
    else if (step === "time") {
      if (!selectedTime) return;
      if (needsLocationPick) setStep("location");
      else if (needsAddressInput) setStep("address");
      else proceedFromLastStep();
    }
    else if (step === "location") { if (locationPref) proceedFromLastStep(); }
    else if (step === "address") { if (clientAddress.trim()) proceedFromLastStep(); }
  };

  const handleBack = () => {
    if (step === "time") setStep("date");
    else if (step === "location") setStep("time");
    else if (step === "address") setStep("time");
  };

  const continueDisabled =
    submitting ||
    (step === "date" && !selectedDate) ||
    (step === "time" && !selectedTime) ||
    (step === "location" && !locationPref) ||
    (step === "address" && !clientAddress.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Booking</p>
            <h2 className="text-base font-bold text-gray-900 mt-0.5 leading-tight">{offering.title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">with {displayName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-700">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loadingData ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {step === "date" && (
                <div className="px-6 py-5">
                  <p className="text-sm font-semibold text-gray-900 mb-4">Choose a date</p>
                  <div className="grid grid-cols-7 gap-1 text-center">
                    {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
                      <div key={d} className="text-[10px] font-medium text-gray-400 pb-1">{d}</div>
                    ))}
                    {Array.from({ length: calendarDays[0]?.dow ?? 0 }).map((_, i) => <div key={`b${i}`} />)}
                    {calendarDays.map(({ date, available }) => {
                      const d = new Date(date + "T00:00:00");
                      return (
                        <button
                          key={date}
                          disabled={!available}
                          onClick={() => { setSelectedDate(date); setSelectedTime(null); }}
                          className={`aspect-square rounded-xl text-xs font-medium transition-colors flex flex-col items-center justify-center ${
                            date === selectedDate ? "bg-gray-900 text-white" :
                            available ? "hover:bg-gray-100 text-gray-800" :
                            "text-gray-300 cursor-not-allowed"
                          }`}
                        >
                          <span>{d.getDate()}</span>
                          <span className="text-[9px] opacity-60">{d.toLocaleDateString("en-US", { month: "short" })}</span>
                        </button>
                      );
                    })}
                  </div>
                  {availability.length === 0 && (
                    <p className="text-center text-sm text-gray-400 mt-6">No availability set for this trainer yet.</p>
                  )}
                </div>
              )}

              {step === "time" && (
                <div className="px-6 py-5">
                  <p className="text-sm text-gray-500 mb-1">{selectedDate && fmtDate(selectedDate)}</p>
                  <p className="text-sm font-semibold text-gray-900 mb-4">Choose a time</p>
                  {timeSlots.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-8">No slots available on this date.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map((slot) => (
                        <button
                          key={slot}
                          onClick={() => setSelectedTime(slot)}
                          className={`py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                            selectedTime === slot ? "bg-gray-900 text-white border-gray-900" : "border-gray-200 text-gray-700 hover:border-gray-400"
                          }`}
                        >
                          {fmtTime(slot)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === "location" && (
                <div className="px-6 py-5">
                  <p className="text-sm font-semibold text-gray-900 mb-4">Choose a location</p>
                  <div className="space-y-2">
                    {(pt.training_locations ?? []).map((loc) => (
                      <button
                        key={loc}
                        onClick={() => setLocationPref(loc)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${
                          locationPref === loc ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-800">{loc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === "address" && (
                <div className="px-6 py-5">
                  <p className="text-sm font-semibold text-gray-900 mb-1">Your address</p>
                  <p className="text-xs text-gray-500 mb-4">Enter the address where you'd like the session.</p>
                  <textarea
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    placeholder="e.g. 14 Riverside Drive, Westlands, Nairobi"
                    rows={3}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 resize-none"
                  />
                  {offering.service_zones && offering.service_zones.length > 0 && (
                    <p className="text-xs text-gray-400 mt-2">Served areas: {offering.service_zones.join(", ")}</p>
                  )}
                  {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
                </div>
              )}

              {step === "confirmed" && (
                <div className="px-6 py-10 flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-5">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Booking Confirmed!</h3>
                  <p className="text-sm text-gray-500 mb-5">Your intro session with {displayName} is booked.</p>
                  <div className="w-full bg-gray-50 rounded-2xl p-4 text-left space-y-2 mb-6">
                    {selectedDate && (
                      <div className="flex items-start gap-2.5">
                        <span className="text-base leading-none mt-0.5">📅</span>
                        <span className="text-sm text-gray-700">{fmtDate(selectedDate)}</span>
                      </div>
                    )}
                    {selectedTime && (
                      <div className="flex items-start gap-2.5">
                        <span className="text-base leading-none mt-0.5">🕐</span>
                        <span className="text-sm text-gray-700">{fmtTime(selectedTime)}</span>
                      </div>
                    )}
                    <div className="flex items-start gap-2.5">
                      <span className="text-base leading-none mt-0.5">🎁</span>
                      <span className="text-sm text-gray-700">Free intro session</span>
                    </div>
                  </div>
                  <button onClick={onClose} className="w-full bg-black text-white text-sm font-semibold py-3 rounded-full hover:bg-gray-800 transition-colors">
                    Done
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loadingData && step !== "confirmed" && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
            {step !== "date" && (
              <button
                onClick={handleBack}
                className="flex-1 py-3 rounded-full border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={handleContinue}
              disabled={continueDisabled}
              className="flex-1 py-3 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Confirming…
                </span>
              ) : (step === "time" && !needsLocationPick && !needsAddressInput) ||
                step === "location" || step === "address"
                ? (isFree ? "Confirm Booking" : "Continue to Payment →")
                : "Continue"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
