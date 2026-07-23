// Reusable animated map-route: dashed orange path with a moving pin.
export function RouteLine({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 300 160"
      fill="none"
      className={className}
      aria-hidden="true"
      preserveAspectRatio="none"
    >
      {/* faint street grid */}
      <g stroke="#E7E1DB" strokeWidth="1">
        <path d="M0 40h300M0 90h300M0 130h300" />
        <path d="M60 0v160M150 0v160M230 0v160" />
      </g>
      {/* base route */}
      <path
        d="M20 135 C 70 135, 60 70, 120 70 S 210 40, 250 25"
        stroke="#FFD9C2"
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* animated route dash */}
      <path
        d="M20 135 C 70 135, 60 70, 120 70 S 210 40, 250 25"
        stroke="#F4600A"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="10 14"
        className="motion-safe:animate-dash-move"
      />
      {/* origin dot */}
      <circle cx="20" cy="135" r="6" fill="#141419" />
      <circle cx="20" cy="135" r="3" fill="#fff" />
      {/* destination pin */}
      <g className="motion-safe:animate-float" style={{ transformOrigin: "250px 25px" } as React.CSSProperties}>
        <path
          d="M250 8c6 0 11 4.7 11 10.6 0 7-8.4 13.9-10.4 15.5a1 1 0 0 1-1.2 0C247.4 32.5 239 25.6 239 18.6 239 12.7 244 8 250 8Z"
          fill="#F4600A"
        />
        <circle cx="250" cy="18.6" r="4" fill="#fff" />
      </g>
    </svg>
  );
}
