"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

type Phase = "checking" | "completed" | "failed";

type BookingDetails = {
  confirmationCode: string | null;
  remainderAmount: number | null;
  itemName: string | null;
  type: string;
};

export default function CallbackClient() {
  const searchParams = useSearchParams();
  const orderTrackingId = searchParams.get("OrderTrackingId") ?? "";
  const [phase, setPhase] = useState<Phase>("checking");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderTrackingId) {
      setError("No payment reference found.");
      setPhase("failed");
      return;
    }

    let attempts = 0;
    const MAX_ATTEMPTS = 15;

    const check = async () => {
      try {
        const res = await fetch(`/api/pesapal/status?orderTrackingId=${orderTrackingId}`, { cache: "no-store" });
        const data = await res.json();
        const desc: string = data.payment_status_description ?? "";

        if (desc === "Completed") {
          setPaymentMethod(data.payment_method ?? "");
          setConfirmationCode(data.confirmation_code ?? "");
          if (data.bookingDetails) setBookingDetails(data.bookingDetails);
          setPhase("completed");
        } else if (["Failed", "Reversed", "Invalid"].includes(desc)) {
          setError("Payment was not completed. Please try again.");
          setPhase("failed");
        } else if (++attempts < MAX_ATTEMPTS) {
          setTimeout(check, 3000);
        } else {
          setError("Payment confirmation is taking longer than expected. Check your bookings page.");
          setPhase("failed");
        }
      } catch {
        if (++attempts < MAX_ATTEMPTS) setTimeout(check, 3000);
        else { setError("Could not confirm payment status."); setPhase("failed"); }
      }
    };

    void check();
  }, [orderTrackingId]);

  if (phase === "checking") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-4 max-w-sm w-full">
          <div className="w-12 h-12 border-[3px] border-gray-100 border-t-gray-900 rounded-full animate-spin mx-auto" />
          <p className="text-base font-semibold text-gray-900">Confirming payment…</p>
          <p className="text-sm text-gray-400">This usually takes a few seconds.</p>
        </div>
      </div>
    );
  }

  if (phase === "completed") {
    const remainder = bookingDetails?.remainderAmount ?? 0;
    const checkInCode = bookingDetails?.confirmationCode;
    const itemName = bookingDetails?.itemName;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4 max-w-sm w-full">

          {/* Success banner */}
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            <p className="text-sm font-semibold text-green-800">Booking Confirmed!</p>
          </div>

          {itemName && (
            <p className="text-sm text-gray-500 px-1">{itemName}</p>
          )}

          {/* Check-in code */}
          {checkInCode && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">Check-in code</p>
              <p className="font-mono text-3xl font-bold tracking-widest text-black">{checkInCode}</p>
              {remainder > 0 && (
                <p className="text-sm text-gray-500 border-t border-gray-100 pt-3">
                  Bring <span className="font-semibold text-gray-800">KES {remainder.toLocaleString()}</span> to pay the remainder at the venue.
                </p>
              )}
            </div>
          )}

          {/* PesaPal reference */}
          {confirmationCode && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-1">
              <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide">
                {paymentMethod ? `${paymentMethod} reference` : "Payment reference"}
              </p>
              <p className="font-mono text-sm font-bold text-gray-900">{confirmationCode}</p>
              {remainder > 0 && (
                <p className="text-sm text-gray-500 mt-2 pt-2 border-t border-gray-100">
                  Bring <span className="font-semibold text-gray-800">KES {remainder.toLocaleString()}</span> to pay the remainder at the venue.
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <Link
              href="/bookings"
              className="block w-full py-3 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition text-center"
            >
              View my bookings
            </Link>
            <Link
              href="/sessions"
              className="block w-full py-3 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition text-center"
            >
              Explore more sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center space-y-5 max-w-sm w-full">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Payment Failed</h2>
          <p className="text-sm text-gray-500 mt-1">{error ?? "The payment was not completed."}</p>
        </div>
        <div className="space-y-2">
          <Link href="/bookings" className="block w-full py-3 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition text-center">
            My bookings
          </Link>
          <Link href="/sessions" className="block w-full py-3 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition text-center">
            Back to sessions
          </Link>
        </div>
      </div>
    </div>
  );
}
