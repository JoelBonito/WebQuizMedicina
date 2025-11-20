import * as Sentry from '@sentry/react';

// Only initialize Sentry in production
export function initSentry() {
  if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
    Sentry.init({
      dsn: import.meta.env.VITE_SENTRY_DSN,
      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
      ],
      // Performance Monitoring
      tracesSampleRate: 1.0, // Capture 100% of transactions in production (adjust as needed)
      // Session Replay
      replaysSessionSampleRate: 0.1, // Sample 10% of sessions
      replaysOnErrorSampleRate: 1.0, // Sample 100% of sessions with errors
      // Environment
      environment: import.meta.env.MODE,
      // Release tracking
      release: import.meta.env.VITE_APP_VERSION || 'development',
      // Before send - filter sensitive data
      beforeSend(event, hint) {
        // Don't send events in development
        if (import.meta.env.DEV) {
          return null;
        }

        // Filter out sensitive data from breadcrumbs and context
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => {
            if (breadcrumb.data) {
              // Remove tokens, passwords, etc.
              const { token, password, access_token, ...sanitizedData } = breadcrumb.data;
              breadcrumb.data = sanitizedData;
            }
            return breadcrumb;
          });
        }

        return event;
      },
    });

    console.log('✅ Sentry initialized for error monitoring');
  }
}

// Error boundary fallback component
export function SentryErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <svg
            className="w-20 h-20 mx-auto text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Ops! Algo deu errado
        </h1>
        <p className="text-gray-600 mb-6">
          Encontramos um erro inesperado. Nossa equipe foi notificada e estamos trabalhando para resolver.
        </p>
        <details className="text-left bg-gray-50 rounded-lg p-4 mb-6">
          <summary className="cursor-pointer text-sm font-semibold text-gray-700 mb-2">
            Detalhes técnicos
          </summary>
          <pre className="text-xs text-gray-600 overflow-auto">
            {error.message}
          </pre>
        </details>
        <button
          onClick={resetError}
          className="bg-[#0891B2] text-white px-6 py-3 rounded-lg hover:bg-[#0e7490] transition-colors"
        >
          Tentar Novamente
        </button>
      </div>
    </div>
  );
}
