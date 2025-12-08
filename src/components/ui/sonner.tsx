"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'bg-background/95 backdrop-blur-md border border-border shadow-lg',
          title: 'text-foreground font-semibold',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          cancelButton: 'bg-muted text-muted-foreground',
          success: 'bg-green-50/95 dark:bg-green-950/95 border-green-200 dark:border-green-800',
          error: 'bg-red-50/95 dark:bg-red-950/95 border-red-200 dark:border-red-800',
          warning: 'bg-yellow-50/95 dark:bg-yellow-950/95 border-yellow-200 dark:border-yellow-800',
          info: 'bg-blue-50/95 dark:bg-blue-950/95 border-blue-200 dark:border-blue-800',
        },
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
