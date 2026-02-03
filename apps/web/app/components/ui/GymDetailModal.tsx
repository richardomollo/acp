"use client";

import { useState } from "react";

export default function GymSessions({ sessions }: { sessions: any[] }) {
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  return (
    <div>
      {/* SESSION LIST */}
      <ul className="grid gap-4 sm:grid-cols-2">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="border rounded-lg p-4 hover:shadow-sm cursor-pointer transition"
            onClick={() => setSelectedSession(session)}
          >
            <h3 className="font-medium">{session.name}</h3>
            <p className="text-sm text-gray-500">{session.category} · {session.level}</p>
          </li>
        ))}
      </ul>

      {/* MODAL */}
      {selectedSession && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg max-w-lg w-full p-6 relative">
            <button
              onClick={() => setSelectedSession(null)}
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-xl"
            >
              &times;
            </button>

            {selectedSession.image_url && (
              <img
                src={selectedSession.image_url}
                alt={selectedSession.name}
                className="w-full h-48 object-cover rounded-lg mb-4"
              />
            )}

            <h2 className="text-2xl font-semibold mb-2">{selectedSession.name}</h2>
            <p className="text-sm text-gray-500 mb-2">
              {selectedSession.category} · {selectedSession.level} · {selectedSession.duration_min} min
            </p>
            {selectedSession.description && (
              <p className="text-gray-600">{selectedSession.description}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
