#!/usr/bin/env node
/**
 * stdio.js — thin stdio-to-HTTP bridge for the firmenliste.net MCP server.
 *
 * The actual server runs as a remote Cloudflare Worker (Streamable HTTP).
 * This wrapper lets stdio-based MCP clients (and automated inspections
 * like Glama's) run the server locally: it forwards each JSON-RPC message
 * from stdin to the remote endpoint and writes the response to stdout.
 *
 * No dependencies. Requires Node 18+ (global fetch).
 * Usage: node stdio.js
 */

const ENDPOINT =
  process.env.FIRMENLISTE_MCP_URL ||
  "https://firmenliste-mcp.cf-firmenliste.workers.dev";

const readline = require("node:readline");

const rl = readline.createInterface({ input: process.stdin, terminal: false });

let queue = Promise.resolve();

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (trimmed === "") return;

  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (e) {
    process.stderr.write("firmenliste-mcp stdio: invalid JSON on stdin\n");
    return;
  }

  // Notifications (no id) expect no response — forward-and-forget.
  const isNotification = msg.id === undefined || msg.id === null;

  queue = queue.then(async () => {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "firmenliste-mcp-stdio/1.0 (+https://github.com/tankstellen/firmenliste-mcp)",
        },
        body: JSON.stringify(msg),
      });

      if (isNotification) return;

      const text = await res.text();
      if (text && text.trim() !== "") {
        process.stdout.write(text.trim() + "\n");
      } else {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32603, message: "Empty response from remote endpoint" },
          }) + "\n"
        );
      }
    } catch (e) {
      if (!isNotification) {
        process.stdout.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            error: { code: -32603, message: "Remote endpoint unreachable: " + e.message },
          }) + "\n"
        );
      }
    }
  });
});

rl.on("close", () => {
  queue.then(() => process.exit(0));
});
