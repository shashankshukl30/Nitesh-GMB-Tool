import type { NextConfig } from "next";

// Security headers. The tool has no database, no cookies and no third-party
// scripts, so the policy can be genuinely strict: everything loads from self.
// `connect-src 'self'` is enough because Google is called SERVER-side only —
// the visitor's browser never talks to Google, and the API key never leaves
// the server.
// React's development build uses eval() for debugging features (reconstructing
// callstacks, Fast Refresh). It never does in production, so 'unsafe-eval' is
// granted ONLY in dev — the shipped policy stays strict.
const DEV = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // This project is self-contained. Pin the workspace root so a lockfile in a
  // parent directory can never be picked up as the build root.
  turbopack: { root: import.meta.dirname },
  // Don't auto-generate AI agent rule files into a client deliverable — the
  // documentation of record is README.md and RUNBOOK.md.
  agentRules: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
