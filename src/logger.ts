import { config } from "./config";

const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const COLORS: Record<string, string> = { debug: "\x1b[36m", info: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" };
const RESET = "\x1b[0m";

function log(level: string, msg: string, ctx?: string) {
  if (LEVELS[level] >= LEVELS[config.logLevel]) {
    const ts = new Date().toISOString();
    const c = ctx ? `[${ctx}] ` : "";
    console.log(`${COLORS[level]}[${ts}] ${level.toUpperCase().padEnd(5)}${RESET} ${c}${msg}`);
  }
}

export const logger = {
  debug: (msg: string, ctx?: string) => log("debug", msg, ctx),
  info: (msg: string, ctx?: string) => log("info", msg, ctx),
  warn: (msg: string, ctx?: string) => log("warn", msg, ctx),
  error: (msg: string, ctx?: string) => log("error", msg, ctx),
};
