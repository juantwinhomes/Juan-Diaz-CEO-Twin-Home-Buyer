/**
 * HTTP entry point.
 *
 * Speaks MCP over Streamable HTTP in stateless mode: each request builds its own
 * server and transport, so instances can scale to zero and back without any
 * session affinity. That is what makes this safe to run on Cloud Run.
 *
 * Auth: if MCP_SHARED_SECRET is set, requests must present it either as a bearer
 * token or as the final path segment (/mcp/<secret>). The path form exists
 * because connector UIs generally accept a URL and nothing else.
 */
import { timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";
import apiRouter from "./api.js";
import {
  checkPassword,
  clearSessionCookie,
  dashboardEnabled,
  guard,
  isSignedIn,
  setSessionCookie,
} from "./auth.js";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = (process.env.MCP_SHARED_SECRET ?? "").trim();
const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: false }));

function secretMatches(candidate: string): boolean {
  if (!SECRET) return true;
  const a = Buffer.from(candidate);
  const b = Buffer.from(SECRET);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authorized(req: Request): boolean {
  if (!SECRET) return true;
  const header = req.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (bearer && secretMatches(bearer)) return true;
  const fromPath = (req.params as { secret?: string }).secret;
  return typeof fromPath === "string" && secretMatches(fromPath);
}

function buildServer(): McpServer {
  const server = new McpServer(
    { name: "ga4-mcp-server", version: "1.0.0" },
    {
      instructions:
        "Read-only access to a Google Analytics 4 property. Call ga4_list_properties first if you do not know the property ID. Dates accept YYYY-MM-DD, NdaysAgo, yesterday or today.",
    },
  );
  registerTools(server);
  return server;
}

async function handleMcp(req: Request, res: Response): Promise<void> {
  if (!authorized(req)) {
    res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Unauthorized: missing or incorrect shared secret." },
      id: null,
    });
    return;
  }

  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP request failed:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error." },
        id: null,
      });
    }
  }
}

app.post("/mcp", handleMcp);
app.post("/mcp/:secret", handleMcp);

// Stateless mode has no stream to resume and no session to delete.
const methodNotAllowed = (_req: Request, res: Response): void => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." },
    id: null,
  });
};
app.get("/mcp", methodNotAllowed);
app.get("/mcp/:secret", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);
app.delete("/mcp/:secret", methodNotAllowed);

/* ------------------------------------------------------------------ web app -- */

function loginPage(error?: string): string {
  const html = readFileSync(join(PUBLIC_DIR, "login.html"), "utf8");
  return error
    ? html.replace("<!--ERROR-->", `<p class="err">${error}</p>`)
    : html.replace("<!--ERROR-->", "");
}

app.get("/login", (req, res) => {
  if (!dashboardEnabled) {
    res.status(503).send("Dashboard disabled: DASHBOARD_PASSWORD is not set on this service.");
    return;
  }
  if (isSignedIn(req)) {
    res.redirect("/");
    return;
  }
  res.type("html").send(loginPage());
});

app.post("/login", (req, res) => {
  if (!dashboardEnabled) {
    res.status(503).send("Dashboard disabled: DASHBOARD_PASSWORD is not set on this service.");
    return;
  }
  const given = typeof req.body?.password === "string" ? req.body.password : "";
  if (!checkPassword(given)) {
    res.status(401).type("html").send(loginPage("Incorrect password."));
    return;
  }
  setSessionCookie(res);
  res.redirect("/");
});

app.get("/logout", (_req, res) => {
  clearSessionCookie(res);
  res.redirect("/login");
});

app.use("/api", guard, apiRouter);

app.get("/", guard, (_req, res) => {
  res.type("html").send(readFileSync(join(PUBLIC_DIR, "index.html"), "utf8"));
});

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "ga4-mcp-server",
    mcpAuthRequired: Boolean(SECRET),
    dashboardEnabled,
    defaultProperty: process.env.GA4_PROPERTY_ID ?? null,
  });
});

app.listen(PORT, () => {
  console.log(`ga4-mcp-server listening on :${PORT}`);
  console.log(`  MCP endpoint:     /mcp  ${SECRET ? "(shared secret required)" : "(OPEN — set MCP_SHARED_SECRET)"}`);
  console.log(`  Dashboard:        ${dashboardEnabled ? "/ (password protected)" : "DISABLED — set DASHBOARD_PASSWORD"}`);
  console.log(`  Default property: ${process.env.GA4_PROPERTY_ID ?? "(none — callers must pass propertyId)"}`);
});
