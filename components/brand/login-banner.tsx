import { Wordmark } from "./wordmark";

export function LoginBanner({ tagline }: { tagline: string }) {
  return (
    <div className="mb-8 flex flex-col items-center gap-3 text-center">
      <Wordmark size="lg" />
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-near-black/60">
        {tagline}
      </p>
    </div>
  );
}
