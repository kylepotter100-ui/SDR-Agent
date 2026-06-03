const SIZES = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl sm:text-5xl",
} as const;

export function Wordmark({
  size = "md",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      className={`font-serif leading-none tracking-tight text-brand-near-black ${SIZES[size]} ${className}`}
    >
      KP <span className="text-brand-accent">Solutions</span>
    </span>
  );
}
