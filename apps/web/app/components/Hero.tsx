"use client";

import { useState } from "react";
import Popup from "./ui/Modal";
import Link from "next/link";

export default function Hero() {
  const [open, setOpen] = useState(false);

  return (
    <section
      className="relative w-full bg-cover bg-center bg-no-repeat pb-44 pt-100 md:pt-10 lg:pt-64 text-sm min-h-screen"
      style={{
        backgroundImage:
          "url('/images/desktop.jpg')" // put image in /public/images
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-white/0 backdrop-blur-s" />

      {/* Content */}
      <div className="relative z-10 -mt-10">
        <h2 className="text-4xl md:text-7xl font-bold max-w-[850px] text-white  text-center mx-auto mt-8">
          All things fitness, play, & wellness in one place
        </h2>

        <p className="mt-6 text-m md:text-base mx-auto max-w-2xl  text-white text-center max-md:px-2">
          The most flexible sports and wellness membership in Nairobi. Activities for individuals, partners, kids, and families — train,
          play, and unwind anytime, anywhere.
        </p>

        <div className="mx-auto w-full flex items-center justify-center gap-3 mt-6">
          <button className="bg-blue-500 hover:bg-black text-white px-6 py-3 rounded-full font-medium transition">
            <Link href="/login?view=signup">Get 14 Days Free!</Link>
          </button>

          <button className="flex items-center gap-2 border border-slate-300 hover:bg-slate-200/30 text-white  rounded-full px-6 py-3">
            <Link href="/sessions/">Browse Activities, Classes & Wellness Sessions</Link>
            <svg
              width="6"
              height="8"
              viewBox="0 0 6 8"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M1.25.5 4.75 4l-3.5 3.5"
                stroke="#050040"
                strokeOpacity=".4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <Popup open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
