import * as React from "react";
import { Slot } from "@radix-ui/react-slot@1.1.2";
import { cva, type VariantProps } from "class-variance-authority@0.7.1";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-lg px-2.5 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-all duration-300 overflow-hidden backdrop-blur-md relative shadow-sm hover:shadow-md",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-br from-primary/80 to-primary/90 text-primary-foreground border border-white/30 [a&]:hover:from-primary/90 [a&]:hover:to-primary before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-0 [a&]:hover:before:opacity-100 before:transition-opacity before:duration-300",
        secondary:
          "bg-gradient-to-br from-secondary/70 to-secondary/80 text-secondary-foreground border border-white/30 [a&]:hover:from-secondary/80 [a&]:hover:to-secondary/90 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-0 [a&]:hover:before:opacity-100 before:transition-opacity before:duration-300",
        destructive:
          "bg-gradient-to-br from-destructive/80 to-destructive/90 text-white border border-white/30 [a&]:hover:from-destructive/90 [a&]:hover:to-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/20 before:to-transparent before:opacity-0 [a&]:hover:before:opacity-100 before:transition-opacity before:duration-300",
        outline:
          "text-foreground bg-white/40 backdrop-blur-xl border border-gray-200/50 [a&]:hover:bg-white/60 [a&]:hover:text-accent-foreground dark:bg-input/20 dark:border-input/40 dark:[a&]:hover:bg-input/30 before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/30 before:to-transparent before:opacity-0 [a&]:hover:before:opacity-100 before:transition-opacity before:duration-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
