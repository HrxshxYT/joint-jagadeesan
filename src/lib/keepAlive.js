import { createServer } from "node:http";

// A tiny HTTP server whose only job is to answer pings. On free always-on hosts
// (Replit, etc.) the process is put to sleep when nothing hits its web port, so
// an external monitor like UptimeRobot pings this endpoint on an interval to keep
// the container awake. It intentionally shares no state with the bot — if the bot
// is alive enough to keep the event loop running, this responds 200.
// Prefer the port the host actually exposes. Pterodactyl injects SERVER_PORT for
// the primary allocation; most PaaS hosts inject PORT. Fall back to 3000 locally.
const hostPort = process.env.SERVER_PORT ?? process.env.PORT ?? 3000;

export function startKeepAlive({ port = hostPort, host = "0.0.0.0", log = console } = {}) {
  const server = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }));
      return;
    }
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("Suzune is alive.\n");
  });

  // A port already in use shouldn't crash the bot — the bot is the point, the
  // ping server is a convenience. Log and carry on.
  server.on("error", (err) => {
    log.error?.(`Keep-alive server error: ${err.message}`) ?? log.error(err);
  });

  // Bind 0.0.0.0 explicitly — inside a container, binding only localhost makes the
  // port unreachable from outside even when it's forwarded.
  server.listen(port, host, () => {
    log.log?.(`Keep-alive server listening on ${host}:${port}`) ??
      log.info?.(`Keep-alive server listening on ${host}:${port}`);
  });

  return server;
}
