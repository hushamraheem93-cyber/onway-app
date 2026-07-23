import type { ReactNode } from "react";

// A clean, device-agnostic phone frame. Content fills the screen area.
export function PhoneFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[9/19] w-full max-w-[280px] rounded-[2.75rem] border-[6px] border-ink bg-ink p-1.5 shadow-2xl ${className}`}
    >
      {/* notch */}
      <div className="absolute left-1/2 top-2 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-ink" />
      <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-cream">
        {children}
      </div>
    </div>
  );
}
