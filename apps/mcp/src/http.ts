import { createMcpHandler } from "@modelcontextprotocol/server";
import { MCP_HOST, MCP_PATH, MCP_PORT } from "./env";
import { createDegiroidMcpServer } from "./server";

const mcp = createMcpHandler(() => createDegiroidMcpServer(), {
  legacy: "stateless",
});

const server = Bun.serve({
  hostname: MCP_HOST,
  port: MCP_PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, mcp: MCP_PATH });
    }

    if (url.pathname === MCP_PATH || url.pathname.startsWith(`${MCP_PATH}/`)) {
      // Present MCP endpoint at /mcp while handler expects root path semantics.
      const rewritten = new URL(req.url);
      rewritten.pathname =
        url.pathname === MCP_PATH
          ? "/"
          : url.pathname.slice(MCP_PATH.length) || "/";
      return mcp.fetch(
        new Request(rewritten, {
          method: req.method,
          headers: req.headers,
          body: req.body,
          duplex: "half",
        } as RequestInit),
      );
    }

    return new Response("Not found", { status: 404 });
  },
});

console.error(
  `Degiroid MCP HTTP on http://${MCP_HOST}:${MCP_PORT}${MCP_PATH}`,
);

export default server;
