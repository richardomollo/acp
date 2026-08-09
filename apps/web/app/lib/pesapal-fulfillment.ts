// Shared between the IPN webhook and the client-side status poll, since either
// one may be the first to observe a completed payment — Pesapal's IPN delivery
// isn't guaranteed, so the callback page's poll needs to be able to self-heal.
import type { SupabaseClient } from "@supabase/supabase-js";

function callNotify(fn: string, record: any) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${fn}`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    },
    body: JSON.stringify({ record }),
  }).catch((err) => console.error(`callNotify ${fn} error:`, err));
}

function callEmail(type: string, data: any) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`;
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
    body: JSON.stringify({ type, data }),
  }).catch((err) => console.error(`callEmail ${type} error:`, err));
}

export async function fulfillBooking(supabase: SupabaseClient, order: any, confirmationCode: string) {
  const meta = order.metadata ?? {};

  if (order.type === "pt") {
    let ptBookingId: string | null = meta.bookingId ?? null;

    if (ptBookingId) {
      await supabase.from("pt_bookings")
        .update({ payment_status: "paid", status: "confirmed", mpesa_reference: confirmationCode })
        .eq("id", ptBookingId);
    } else {
      const { data: created } = await supabase.from("pt_bookings").insert({
        pt_id: meta.ptId,
        offering_id: meta.offeringId,
        user_id: meta.userId ?? null,
        guest_name: meta.guestName ?? null,
        guest_email: meta.guestEmail ?? null,
        guest_phone: meta.guestPhone ?? null,
        scheduled_date: meta.scheduledDate,
        scheduled_time: meta.scheduledTime,
        location_type: meta.locationType,
        client_address: meta.clientAddress ?? null,
        payment_method: "pesapal",
        amount_kes: order.amount,
        payment_status: "paid",
        status: "confirmed",
        mpesa_reference: confirmationCode,
      }).select("id").single();
      ptBookingId = created?.id ?? null;
    }

    if (meta.programmeId && ptBookingId) {
      await supabase.from("pt_programme_enrollments").insert({
        programme_id: meta.programmeId,
        pt_id: meta.ptId,
        intro_booking_id: ptBookingId,
        user_id: meta.userId ?? null,
        guest_name: meta.guestName ?? null,
        guest_email: meta.guestEmail ?? null,
        guest_phone: meta.guestPhone ?? null,
        status: "intro_booked",
      });
    }

    if (ptBookingId) {
      const { data: ptBooking } = await supabase.from("pt_bookings").select("*").eq("id", ptBookingId).single();
      if (ptBooking) {
        callNotify("notify-pt-booking", ptBooking);
        const guestEmail = meta.guestEmail ?? ptBooking.guest_email ?? null;
        if (guestEmail) {
          callEmail("guest_pt_confirmation", {
            email: guestEmail,
            customerName: meta.guestName || ptBooking.guest_name || "there",
            scheduledDate: meta.scheduledDate ?? ptBooking.scheduled_date ?? "",
            scheduledTime: meta.scheduledTime ?? ptBooking.scheduled_time ?? "",
            locationType: meta.locationType ?? ptBooking.location_type ?? "in_gym",
            clientAddress: meta.clientAddress ?? ptBooking.client_address ?? null,
          });
        }
      }
    }
    return;
  }

  if (order.type === "session" && meta.bookingId) {
    await supabase
      .from("bookings")
      .update({ status: "deposit_paid", deposit_payment_id: confirmationCode, deposit_paid_at: new Date().toISOString() })
      .eq("id", meta.bookingId);
    const { data: booking } = await supabase
      .from("bookings")
      .select("*, sessions(name, date, time, gyms(name, location))")
      .eq("id", meta.bookingId)
      .single();
    if (booking) {
      callNotify("notify-booking", booking);
      if (booking.guest_email) {
        const sess = booking.sessions as any;
        const gym = Array.isArray(sess?.gyms) ? sess.gyms[0] : sess?.gyms;
        callEmail("guest_booking_confirmation", {
          email: booking.guest_email,
          customerName: booking.guest_name || "there",
          sessionName: sess?.name ?? "Session",
          sessionDate: sess?.date ?? "",
          sessionTime: sess?.time ?? "",
          venueName: gym?.name ?? "",
          venueLocation: gym?.location ?? "",
          confirmationCode: booking.confirmation_code ?? "",
          remainderAmount: booking.remainder_amount ?? 0,
          bookingId: meta.bookingId,
        });
      }
    }
    return;
  }

  if (order.type === "experience" && meta.bookingId) {
    await supabase
      .from("experience_bookings")
      .update({ status: "deposit_paid", deposit_paid_at: new Date().toISOString(), deposit_payment_id: confirmationCode })
      .eq("id", meta.bookingId);
    const { data: booking } = await supabase.from("experience_bookings").select("*").eq("id", meta.bookingId).single();
    if (booking) {
      callNotify("notify-experience-booking", booking);
      if (booking.email) {
        const { data: expDetail } = await supabase
          .from("experiences")
          .select("title, date, gyms(name, location)")
          .eq("id", booking.experience_id)
          .single();
        const gym = Array.isArray(expDetail?.gyms) ? (expDetail.gyms as any[])[0] : expDetail?.gyms as any;
        callEmail("guest_experience_confirmation", {
          email: booking.email,
          customerName: booking.guest_name || "there",
          experienceName: expDetail?.title ?? "Experience",
          experienceDate: expDetail?.date ?? null,
          venueName: gym?.name ?? "",
          venueLocation: gym?.location ?? "",
          confirmationCode: booking.confirmation_code ?? "",
          remainderAmount: booking.remainder_amount ?? 0,
        });
      }
    }
  }
}

// Idempotent: flips the order to "completed" and runs fulfillment only if it
// hasn't already happened. Callable from both the IPN webhook and the
// client-side status poll — whichever observes the completed payment first
// wins; the other becomes a no-op via the `neq("status", "completed")` guard.
export async function completeOrderOnce(
  supabase: SupabaseClient,
  opts: { orderTrackingId?: string; merchantReference?: string; paymentMethod: string; confirmationCode: string },
) {
  const filterCol = opts.merchantReference ? "merchant_reference" : "order_tracking_id";
  const filterVal = opts.merchantReference ?? opts.orderTrackingId;
  if (!filterVal) return null;

  const { data: order } = await supabase
    .from("pesapal_orders")
    .update({
      status: "completed",
      ...(opts.orderTrackingId ? { order_tracking_id: opts.orderTrackingId } : {}),
      payment_method: opts.paymentMethod,
      confirmation_code: opts.confirmationCode,
      updated_at: new Date().toISOString(),
    })
    .eq(filterCol, filterVal)
    .neq("status", "completed")
    .select()
    .maybeSingle();

  if (order) await fulfillBooking(supabase, order, opts.confirmationCode);
  return order;
}
