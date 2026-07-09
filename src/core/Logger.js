import pino from "pino";

export function createLogger({ level = "info", pretty = false } = {}) {
  if (pretty) {
    return pino({
      level,
      transport: { target: "pino-pretty", options: { colorize: true } },
    });
  }
  return pino({ level });
}
