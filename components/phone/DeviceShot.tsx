import Image from "next/image";

// Phone frame wrapping a real app screenshot. The screenshots already include
// their own status bar, so there is no fake notch overlay here.
export function DeviceShot({
  src,
  alt,
  priority = false,
  className = "",
}: {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`relative aspect-[1290/2796] w-[240px] sm:w-[280px] rounded-[2.75rem] border-[6px] border-ink bg-ink p-1.5 shadow-2xl ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[2.25rem] bg-cream">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 70vw, 280px"
          className="object-cover"
          priority={priority}
        />
      </div>
    </div>
  );
}
