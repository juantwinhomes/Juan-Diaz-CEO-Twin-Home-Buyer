/**
 * REST API for the web dashboard.
 *
 * The dashboard is a normal same-origin page, so it can fetch these directly —
 * the restriction that forces the MCP route for Claude artifacts does not apply
 * here. Same GA4 client underneath; different delivery.
 */
import { Router, type Request, type Response } from "express";
import { listProperties, runRealtimeReport, runReport } from "./ga4.js";

const router = Router();

function propertyFor(req: Request): string {
  const given = typeof req.query.propertyId === "string" ? req.query.propertyId.trim() : "";
  const id = given || (process.env.GA4_PROPERTY_ID ?? "").trim();
  if (!id) {
    throw new Error(
      "No GA4 property configured. Set GA4_PROPERTY_ID and redeploy, or pass ?propertyId=… — /api/properties lists the ones you can read.",
    );
  }
  return id;
}

function range(req: Request): { startDate: string; endDate: string } {
  const startDate = typeof req.query.start === "string" && req.query.start ? req.query.start : "28daysAgo";
  const endDate = typeof req.query.end === "string" && req.query.end ? req.query.end : "today";
  return { startDate, endDate };
}

function clampLimit(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 1), max);
}

/** Google's own message is the useful part; 403s get the likely cause attached. */
function fail(res: Response, err: unknown): void {
  const message = err instanceof Error ? err.message : "Unexpected error.";
  const status = /\b403\b|refused the request/.test(message) ? 403 : 500;
  res.status(status).json({ error: message });
}

router.get("/config", (_req, res) => {
  res.json({
    propertyConfigured: Boolean((process.env.GA4_PROPERTY_ID ?? "").trim()),
    propertyId: (process.env.GA4_PROPERTY_ID ?? "").trim() || null,
  });
});

router.get("/properties", async (_req, res) => {
  try {
    res.json({ properties: await listProperties() });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/summary", async (req, res) => {
  try {
    const { startDate, endDate } = range(req);
    const result = await runReport(propertyFor(req), {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "date" }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "newUsers" },
        { name: "engagedSessions" },
        { name: "screenPageViews" },
      ],
      orderBys: [{ dimension: { dimensionName: "date" }, desc: false }],
      limit: "400",
    });
    res.json({ ...result, startDate, endDate });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/sources", async (req, res) => {
  try {
    const { startDate, endDate } = range(req);
    const dimension =
      req.query.breakdown === "sourceMedium" ? "sessionSourceMedium" : "sessionDefaultChannelGroup";
    const result = await runReport(propertyFor(req), {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: dimension }],
      metrics: [
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "engagedSessions" },
        { name: "conversions" },
      ],
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit: String(clampLimit(req.query.limit, 15, 100)),
    });
    res.json({ ...result, breakdown: dimension, startDate, endDate });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/pages", async (req, res) => {
  try {
    const { startDate, endDate } = range(req);
    const result = await runReport(propertyFor(req), {
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "sessions" },
        { name: "activeUsers" },
        { name: "userEngagementDuration" },
      ],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: String(clampLimit(req.query.limit, 20, 250)),
    });
    res.json({ ...result, startDate, endDate });
  } catch (err) {
    fail(res, err);
  }
});

router.get("/realtime", async (req, res) => {
  try {
    const result = await runRealtimeReport(propertyFor(req), {
      metrics: [{ name: "activeUsers" }],
      limit: "1",
    });
    res.json(result);
  } catch (err) {
    fail(res, err);
  }
});

export default router;
