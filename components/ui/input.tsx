import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-md border border-brand-near-black/20 bg-white px-3 text-sm text-brand-near-black placeholder:text-brand-near-black/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent/40",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
