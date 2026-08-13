/**
 * Password gate for the web dashboard.
 *
 * Cloud Run services reachable by Claude are public URLs, so without this
 * anyone holding the link would read your analytics. Set DASHBOARD_PASSWORD and
 * the dashboard requires it; leave it unset and the dashboard refuses to serve
 * at all rather than quietly exposing data.
 *
 * The signing key is derived from the password itself, so every instance of a
 * scaled-out service agrees on it without another env var to manage. Changing
 * the password invalidates existing sessions, which is the desired behaviour.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const PASSWORD = (process.env.DASHBOARD_PASSWORD ?? "").trim();
const COOKIE_NAME = "ga4dash";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

export const dashboardEnabled = PASSWORD.length > 0;

function signingKey(): string {
  return createHmac("sha256", "ga4-dashboard-session").update(PASSWORD).digest("hex");
}

function sign(value: string): string {
  return createHmac("sha256", signingKey()).update(value).digest("base64url");
}

function equal(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function checkPassword(given: string): boolean {
  if (!dashboardEnabled) return false;
  return equal(given, PASSWORD);
}

export function issueToken(): string {
  const expiry = String(Date.now() + MAX_AGE_MS);
  return `${expiry}.${sign(expiry)}`;
}

export function tokenValid(token: string | undefined): boolean {
  if (!token || !dashboardEnabled) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expiry = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return equal(signature, sign(expiry));
}

/** Minimal cookie reader — not worth a dependency for one cookie. */
export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

export function setSessionCookie(res: Response): void {
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${issueToken()}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_MS / 1000}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
}

export function isSignedIn(req: Request): boolean {
  return tokenValid(readCookie(req, COOKIE_NAME));
}

/** Guards the dashboard and its API. Returns 401 JSON for /api, redirects otherwise. */
export function guard(req: Request, res: Response, next: NextFunction): void {
  if (!dashboardEnabled) {
    res.status(503).json({
      error:
        "Dashboard is disabled because DASHBOARD_PASSWORD is not set. Set it and redeploy — serving analytics on a public URL without a password is not safe.",
    });
    return;
  }
  if (isSignedIn(req)) {
    next();
    return;
  }
  // originalUrl, not path: this guard also runs inside a router mounted at
  // /api, where Express has already stripped the mount prefix from req.path.
  // The dashboard's fetch layer keys off a 401, so a redirect here would hand
  // it a login page instead of a status it can act on.
  if (req.originalUrl.startsWith("/api/")) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  res.redirect("/login");
}
