import Image from "next/image";

// OnWay brand mark: the real circular logo (delivery rider) + wordmark.
export function LogoMark({
  className = "",
  showText = true,
  textClassName = "",
}: {
  className?: string;
  showText?: boolean;
  textClassName?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full ring-1 ring-brand-500/15">
        <Image
          src="/logo.png"
          alt="OnWay"
          fill
          sizes="36px"
          className="scale-[1.06] object-cover"
          priority
        />
      </span>
      {showText && (
        <span
          className={`font-display text-[1.35rem] font-bold leading-none tracking-tight text-ink ${textClassName}`}
        >
          On<span className="text-brand-500">Way</span>
        </span>
      )}
    </span>
  );
}
