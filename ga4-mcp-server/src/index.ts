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
import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = (process.env.MCP_SHARED_SECRET ?? "").trim();

const app = express();
app.use(express.json({ limit: "4mb" }));

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

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "ga4-mcp-server",
    authRequired: Boolean(SECRET),
    defaultProperty: process.env.GA4_PROPERTY_ID ?? null,
  });
});

app.listen(PORT, () => {
  console.log(`ga4-mcp-server listening on :${PORT}`);
  console.log(`  auth:             ${SECRET ? "shared secret required" : "OPEN (set MCP_SHARED_SECRET)"}`);
  console.log(`  default property: ${process.env.GA4_PROPERTY_ID ?? "(none — callers must pass propertyId)"}`);
});
