"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const BOOKING_TYPES = ["session", "experience", "community_event"] as const;
type BookingType = (typeof BOOKING_TYPES)[number];

function StarRating({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-gray-900">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="text-3xl leading-none transition-transform active:scale-90"
          >
            <span className={n <= value ? "text-amber-400" : "text-gray-200"}>★</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function FeedbackClient({ type, id }: { type: string; id: string }) {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const bookingType = (BOOKING_TYPES as readonly string[]).includes(type) ? (type as BookingType) : null;

  const [rating, setRating] = useState(0);
  const [wouldBookAgain, setWouldBookAgain] = useState<boolean | null>(null);
  const [platformRating, setPlatformRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!bookingType || !code) {
      setError("This feedback link is invalid.");
      return;
    }
    if (rating === 0) {
      setError("Please rate your experience.");
      return;
    }
    setError(null);
    setSubmitting(true);

    const { error: rpcError } = await supabase.rpc("submit_feedback", {
      p_booking_type: bookingType,
      p_booking_id: id,
      p_confirmation_code: code,
      p_rating: rating,
      p_would_book_again: wouldBookAgain,
      p_platform_rating: platformRating || null,
      p_comment: comment.trim() || null,
    });

    setSubmitting(false);
    if (rpcError) {
      setError("Couldn't submit feedback — this link may be invalid or expired.");
      return;
    }
    setDone(true);
  };

  if (!bookingType || !code) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Invalid feedback link</h1>
        <p className="text-sm text-gray-500">
          This link is missing or malformed. Check the link in your email or notification.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <div className="text-4xl mb-4">🙌</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Thanks for the feedback!</h1>
        <p className="text-sm text-gray-500">It helps us make Lana Health better.</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-6 py-16">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">How was it?</h1>
      <p className="text-sm text-gray-500 mb-8">Your feedback takes 30 seconds and helps us improve.</p>

      <Card className="p-6 flex flex-col gap-6">
        <StarRating value={rating} onChange={setRating} label="Rate your experience" />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-gray-900">Would you book again?</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={wouldBookAgain === true ? "primary" : "secondary"}
              size="sm"
              onClick={() => setWouldBookAgain(true)}
            >
              Yes
            </Button>
            <Button
              type="button"
              variant={wouldBookAgain === false ? "primary" : "secondary"}
              size="sm"
              onClick={() => setWouldBookAgain(false)}
            >
              No
            </Button>
          </div>
        </div>

        <StarRating
          value={platformRating}
          onChange={setPlatformRating}
          label="How was booking through the app/website?"
        />

        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-gray-900">Anything else? (optional)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            placeholder="Tell us more…"
            className="w-full box-border text-[15px] text-ink-900 px-4 py-[13px] rounded-[12px] outline-none border-[1.5px] border-border focus:border-blue-500 focus:shadow-[0_0_0_3px_rgba(0,47,255,0.12)] transition-[border-color,box-shadow] duration-150 resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button onClick={submit} disabled={submitting} block>
          {submitting ? "Submitting…" : "Submit Feedback"}
        </Button>
      </Card>
    </div>
  );
}
