import { createServer } from "node:http";

// A tiny HTTP server whose only job is to answer pings. On free always-on hosts
// (Replit, etc.) the process is put to sleep when nothing hits its web port, so
// an external monitor like UptimeRobot pings this endpoint on an interval to keep
// the container awake. It intentionally shares no state with the bot — if the bot
// is alive enough to keep the event loop running, this responds 200.
export function startKeepAlive({ port = process.env.PORT ?? 3000, log = console } = {}) {
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

  server.listen(port, () => {
    log.log?.(`Keep-alive server listening on port ${port}`) ??
      log.info?.(`Keep-alive server listening on port ${port}`);
  });

  return server;
}
