
import type { LucideIcon } from "lucide-react";

type MetricColor = "blue" | "green" | "red" | "violet";

type MetricCardProps = {
  label: string;
  value: string;
  note: string;
  icon: LucideIcon;
  color: MetricColor;
};

const colorStyles = {
  blue: {
    icon: "bg-[#e8efff] text-[#3157d5]",
    note: "text-[#8b93a3]",
  },
  green: {
    icon: "bg-[#e6f6ee] text-[#2f9167]",
    note: "text-[#43876a]",
  },
  red: {
    icon: "bg-[#ffebe7] text-[#c55243]",
    note: "text-[#bd5548]",
  },
  violet: {
    icon: "bg-[#eeeafe] text-[#6c56bd]",
    note: "text-[#8b93a3]",
  },
};

function MetricCard({
  label,
  value,
  note,
  icon: Icon,
  color,
}: MetricCardProps) {
  const styles = colorStyles[color];

  return (
    <div className="rounded-2xl border border-[#e2e6ed] bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between">
        <p className="text-xs font-medium text-[#7d8699]">
          {label}
        </p>

        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${styles.icon}`}
        >
          <Icon size={18} />
        </div>
      </div>

      <p className="text-[27px] font-bold tracking-tight text-[#202a44]">
        {value}
      </p>

      <p className={`mt-1 text-[11px] font-medium ${styles.note}`}>
        {note}
      </p>
    </div>
  );
}

export default MetricCard;
