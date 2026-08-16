// Server-side error logging — no third-party service, no account, no bill.
//
// The original tool shipped errors to a hosted Sentry org. This build owns its
// own operations, so errors go to stdout, where the host's own log viewer picks
// them up (on Vercel: Project → Logs). Nothing leaves the client's account.
//
// The discipline this preserves matters more than the transport: a failed
// upstream call must be LOUD on the server and SILENT to the visitor. Google's
// error bodies quote quota state, key status and request internals, so they are
// logged here and never returned. Callers degrade gracefully instead.

type Fields = Record<string, unknown>;

export function logError(scope: string, err: unknown, fields?: Fields): void {
  const detail =
    err instanceof Error
      ? { message: err.message, stack: err.stack }
      : { message: String(err) };
  // One JSON line per error keeps it greppable in any log viewer.
  console.error(
    JSON.stringify({
      level: "error",
      scope,
      at: new Date().toISOString(),
      ...detail,
      ...fields,
    }),
  );
}
