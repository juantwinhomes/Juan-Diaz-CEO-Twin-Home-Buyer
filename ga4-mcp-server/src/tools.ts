/**
 * Tool surface exposed to Claude.
 *
 * Every tool is read-only and returns a JSON text block, which is what the
 * dashboard artifact reads as its payload. Tools take an optional propertyId so
 * a caller that only ever looks at one site can rely on GA4_PROPERTY_ID instead
 * of threading the number through every call.
 */
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listProperties, runRealtimeReport, runReport } from "./ga4.js";

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});

function resolveProperty(given?: string): string {
  const id = (given ?? process.env.GA4_PROPERTY_ID ?? "").trim();
  if (!id) {
    throw new Error(
      "No GA4 property specified. Pass propertyId, or set GA4_PROPERTY_ID on the server. Run ga4_list_properties to find the number.",
    );
  }
  return id;
}

const dateArgs = {
  startDate: z
    .string()
    .default("28daysAgo")
    .describe('Start of range: "YYYY-MM-DD", "NdaysAgo", "yesterday", or "today".'),
  endDate: z
    .string()
    .default("today")
    .describe('End of range: "YYYY-MM-DD", "NdaysAgo", "yesterday", or "today".'),
};

const propertyArg = {
  propertyId: z
    .string()
    .optional()
    .describe("Numeric GA4 property ID. Defaults to the server's GA4_PROPERTY_ID."),
};

export function registerTools(server: McpServer): void {
  server.registerTool(
    "ga4_list_properties",
    {
      title: "List GA4 properties",
      description:
        "Lists every GA4 property this server's credentials can read, with the numeric property ID for each. Run this first during setup — if it returns an empty list, the service account has not been granted access to any property yet.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => json({ properties: await listProperties() }),
  );

  server.registerTool(
    "ga4_traffic_summary",
    {
      title: "Traffic summary by day",
      description:
        "Daily sessions, active users, new users, engaged sessions and page views over a date range. This is the series behind a traffic-over-time chart. Rows come back oldest first.",
      inputSchema: { ...propertyArg, ...dateArgs },
      annotations: READ_ONLY,
    },
    async ({ propertyId, startDate, endDate }) => {
      const result = await runReport(resolveProperty(propertyId), {
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
      return json({ ...result, startDate, endDate });
    },
  );

  server.registerTool(
    "ga4_top_pages",
    {
      title: "Top pages",
      description:
        "Highest-traffic pages for a date range, with views, sessions, users and average engagement time in seconds. Use for a 'what are people actually reading' table.",
      inputSchema: {
        ...propertyArg,
        ...dateArgs,
        limit: z.number().int().min(1).max(250).default(25).describe("How many pages to return."),
      },
      annotations: READ_ONLY,
    },
    async ({ propertyId, startDate, endDate, limit }) => {
      const result = await runReport(resolveProperty(propertyId), {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "userEngagementDuration" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: String(limit),
      });
      return json({ ...result, startDate, endDate });
    },
  );

  server.registerTool(
    "ga4_traffic_sources",
    {
      title: "Traffic by channel and source",
      description:
        "Where traffic came from, grouped by default channel (Organic Search, Direct, Referral, Paid, …) with the source/medium underneath. Use to see how much of the site's traffic organic search actually drives.",
      inputSchema: {
        ...propertyArg,
        ...dateArgs,
        breakdown: z
          .enum(["channel", "sourceMedium"])
          .default("channel")
          .describe("Group by broad channel grouping, or by specific source / medium pairs."),
        limit: z.number().int().min(1).max(250).default(25).describe("How many rows to return."),
      },
      annotations: READ_ONLY,
    },
    async ({ propertyId, startDate, endDate, breakdown, limit }) => {
      const dimension =
        breakdown === "channel" ? "sessionDefaultChannelGroup" : "sessionSourceMedium";
      const result = await runReport(resolveProperty(propertyId), {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: dimension }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "engagedSessions" },
          { name: "conversions" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: String(limit),
      });
      return json({ ...result, breakdown: dimension, startDate, endDate });
    },
  );

  server.registerTool(
    "ga4_realtime_users",
    {
      title: "Active users right now",
      description:
        "Users active on the site in the last 30 minutes, optionally split by device, country or page. Unlike the other tools this reflects the current moment, not a date range.",
      inputSchema: {
        ...propertyArg,
        breakdown: z
          .enum(["none", "deviceCategory", "country", "unifiedScreenName"])
          .default("none")
          .describe("Optional split for the active-user count."),
      },
      annotations: READ_ONLY,
    },
    async ({ propertyId, breakdown }) => {
      const result = await runRealtimeReport(resolveProperty(propertyId), {
        dimensions: breakdown === "none" ? undefined : [{ name: breakdown }],
        metrics: [{ name: "activeUsers" }],
        limit: "50",
      });
      return json(result);
    },
  );

  server.registerTool(
    "ga4_run_report",
    {
      title: "Run a custom GA4 report",
      description:
        "Escape hatch for anything the named tools do not cover: pass raw GA4 dimension and metric API names (for example dimensions ['landingPage'] and metrics ['sessions','bounceRate']). Prefer the specific tools when one fits — this one requires knowing the GA4 schema.",
      inputSchema: {
        ...propertyArg,
        ...dateArgs,
        dimensions: z
          .array(z.string())
          .max(9)
          .default([])
          .describe("GA4 dimension API names, e.g. ['date','landingPage']."),
        metrics: z
          .array(z.string())
          .min(1)
          .max(10)
          .describe("GA4 metric API names, e.g. ['sessions','bounceRate']."),
        limit: z.number().int().min(1).max(1000).default(100).describe("Maximum rows to return."),
        orderByMetric: z
          .string()
          .optional()
          .describe("Metric name to sort by, descending. Omit to keep GA4's default order."),
      },
      annotations: READ_ONLY,
    },
    async ({ propertyId, startDate, endDate, dimensions, metrics, limit, orderByMetric }) => {
      const result = await runReport(resolveProperty(propertyId), {
        dateRanges: [{ startDate, endDate }],
        dimensions: dimensions.map((name) => ({ name })),
        metrics: metrics.map((name) => ({ name })),
        limit: String(limit),
        ...(orderByMetric
          ? { orderBys: [{ metric: { metricName: orderByMetric }, desc: true }] }
          : {}),
      });
      return json({ ...result, startDate, endDate });
    },
  );
}
