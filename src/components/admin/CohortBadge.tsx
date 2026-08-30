interface CohortBadgeProps {
  name: string;
  color: string;
  size?: "sm" | "md";
}

export function CohortBadge({ name, color, size = "sm" }: CohortBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{
        borderColor: color,
        color: color,
        backgroundColor: `${color}15`,
      }}
    >
      <span
        className="rounded-full"
        style={{
          width: size === "sm" ? 6 : 8,
          height: size === "sm" ? 6 : 8,
          backgroundColor: color,
        }}
      />
      {name}
    </span>
  );
}
