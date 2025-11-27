"use client";

import Image from "next/image";

interface Participant {
  id: string;
  name: string | null;
  image: string | null;
}

interface ParticipantAvatarsProps {
  participants: Participant[];
  maxDisplay?: number;
  size?: "sm" | "md" | "lg";
}

export default function ParticipantAvatars({
  participants,
  maxDisplay = 3,
  size = "md",
}: ParticipantAvatarsProps) {
  const displayed = participants.slice(0, maxDisplay);
  const remaining = participants.length - maxDisplay;

  const sizeClasses = {
    sm: "w-6 h-6 text-xs",
    md: "w-8 h-8 text-sm",
    lg: "w-10 h-10 text-base",
  };

  const overlapClasses = {
    sm: "-ml-2",
    md: "-ml-3",
    lg: "-ml-4",
  };

  return (
    <div className="flex items-center">
      {displayed.map((participant, index) => (
        <div
          key={participant.id}
          className={`relative ${index > 0 ? overlapClasses[size] : ""}`}
          title={participant.name || "Unknown"}
        >
          {participant.image ? (
            <Image
              src={participant.image}
              alt={participant.name || "Participant"}
              width={size === "sm" ? 24 : size === "md" ? 32 : 40}
              height={size === "sm" ? 24 : size === "md" ? 32 : 40}
              className={`${sizeClasses[size]} rounded-full border-2 border-gray-800 object-cover`}
            />
          ) : (
            <div
              className={`${sizeClasses[size]} rounded-full border-2 border-gray-800 bg-gray-600 flex items-center justify-center text-white font-medium`}
            >
              {participant.name?.charAt(0).toUpperCase() || "?"}
            </div>
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div
          className={`${overlapClasses[size]} ${sizeClasses[size]} rounded-full border-2 border-gray-800 bg-gray-700 flex items-center justify-center text-gray-300 font-medium`}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}
