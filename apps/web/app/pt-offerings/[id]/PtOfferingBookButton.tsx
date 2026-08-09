"use client";

import { useState } from "react";
import BookingModal from "../../trainers/[slug]/BookingModal";

type Offering = {
  id: string;
  title: string;
  type: string | null;
  duration_minutes: number | null;
  price_kes: number | null;
  max_participants: number | null;
  description?: string | null;
  location_details?: string | null;
  meeting_link?: string | null;
  service_zones?: string[] | null;
  // Programme fields
  is_programme?: boolean;
  intro_price_kes?: number | null;
  programme_price_kes?: number | null;
  programme_weeks?: number | null;
};

type PT = {
  id: string;
  full_name: string;
  professional_name?: string | null;
  training_locations?: string[] | null;
};

export default function PtOfferingBookButton({
  pt,
  offering,
  label,
}: {
  pt: PT;
  offering: Offering;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  // For programme intros, override price_kes with intro_price_kes
  const modalOffering = offering.is_programme
    ? { ...offering, price_kes: offering.intro_price_kes ?? offering.price_kes }
    : offering;

  async function handleConfirmed(bookingId: string) {
    if (!offering.is_programme) return;
    // Link the intro booking to a programme enrollment record
    try {
      await fetch("/api/pt-programme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link_intro",
          programme_id: offering.id,
          pt_id: pt.id,
          intro_booking_id: bookingId,
        }),
      });
      setEnrolled(true);
    } catch { /* best-effort */ }
  }

  if (enrolled) {
    return (
      <div className="w-full py-3 rounded-full bg-green-50 border border-green-200 text-green-800 text-sm font-medium text-center">
        Intro booked — your trainer will be in touch
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full py-3 rounded-full bg-black text-white text-sm font-semibold hover:bg-gray-800 transition-colors"
      >
        {label ?? "Book Now"}
      </button>
      {open && (
        <BookingModal
          pt={pt}
          offering={modalOffering}
          onClose={() => setOpen(false)}
          onConfirmed={handleConfirmed}
        />
      )}
    </>
  );
}
