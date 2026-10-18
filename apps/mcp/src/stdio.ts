import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createDegiroidMcpServer } from "./server";

void serveStdio(() => createDegiroidMcpServer());
console.error("Degiroid MCP stdio server running");
