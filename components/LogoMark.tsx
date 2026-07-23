// OnWay wordmark: a location pin whose "tail" is a motion trail — the driver on the way.
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
      <svg
        width="34"
        height="34"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="ow-grad" x1="8" y1="4" x2="32" y2="36" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FF7A3D" />
            <stop offset="1" stopColor="#F4600A" />
          </linearGradient>
        </defs>
        {/* motion trail */}
        <path
          d="M3 27h9"
          stroke="url(#ow-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.45"
        />
        <path
          d="M6 33h7"
          stroke="url(#ow-grad)"
          strokeWidth="3"
          strokeLinecap="round"
          opacity="0.25"
        />
        {/* pin */}
        <path
          d="M25 4.5c6.35 0 11.5 5.02 11.5 11.2 0 7.62-8.02 15.1-10.86 17.53a1 1 0 0 1-1.28 0C21.52 30.8 13.5 23.32 13.5 15.7 13.5 9.52 18.65 4.5 25 4.5Z"
          fill="url(#ow-grad)"
        />
        <circle cx="25" cy="15.6" r="4.3" fill="#fff" />
      </svg>
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
