
  import { createRoot } from "react-dom/client";
  import * as Sentry from '@sentry/react';
  import App from "./App.tsx";
  import "./styles/globals.css";
  import { initSentry, SentryErrorFallback } from "./lib/sentry";

  // Initialize Sentry
  initSentry();

  // Wrap App with Sentry Error Boundary
  const SentryApp = Sentry.withErrorBoundary(App, {
    fallback: SentryErrorFallback,
    showDialog: false, // We have a custom fallback
  });

  createRoot(document.getElementById("root")!).render(<SentryApp />);
