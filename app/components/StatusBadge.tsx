"use client";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

const statusConfig: Record<
  string,
  { label: string; bgColor: string; textColor: string; dotColor: string }
> = {
  IN_PROGRESS: {
    label: "In Progress",
    bgColor: "bg-blue-500/20",
    textColor: "text-blue-400",
    dotColor: "bg-blue-400",
  },
  AWAITING_UPLOADS: {
    label: "Awaiting Uploads",
    bgColor: "bg-yellow-500/20",
    textColor: "text-yellow-400",
    dotColor: "bg-yellow-400",
  },
  PROCESSING: {
    label: "Processing",
    bgColor: "bg-orange-500/20",
    textColor: "text-orange-400",
    dotColor: "bg-orange-400",
  },
  COMPLETED: {
    label: "Completed",
    bgColor: "bg-green-500/20",
    textColor: "text-green-400",
    dotColor: "bg-green-400",
  },
  FAILED: {
    label: "Failed",
    bgColor: "bg-red-500/20",
    textColor: "text-red-400",
    dotColor: "bg-red-400",
  },
};

export default function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    bgColor: "bg-gray-500/20",
    textColor: "text-gray-400",
    dotColor: "bg-gray-400",
  };

  const sizeClasses =
    size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${config.bgColor} ${config.textColor} ${sizeClasses}`}
    >
      <span
        className={`${dotSize} rounded-full ${config.dotColor} ${
          status === "IN_PROGRESS" || status === "PROCESSING"
            ? "animate-pulse"
            : ""
        }`}
      />
      {config.label}
    </span>
  );
}
