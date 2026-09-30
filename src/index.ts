#!/usr/bin/env node
import { config } from "./config";
import { logger } from "./logger";
import { nfcReader } from "./reader-host";
import { runReaderProcess } from "./reader-process";
import { wsServer } from "./websocket-server";

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                 NFC Bridge Server v1.0.2                      ║
║            For VersaTalent Talent Management                  ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);
  logger.info(`Port: ${config.port}, SSL: ${config.sslEnabled}`, "MAIN");

  try {
    // Without a listener, a PC/SC error (e.g. smart card service not running) would crash the process
    nfcReader.on("error", (err: Error) => logger.error(`Reader error: ${err.message}`, "NFC"));
    nfcReader.on("cardInserted", (uid) => logger.info(`Card: ${uid}`, "NFC"));

    // Start the server first so the web app can always reach the bridge,
    // even if the smart card system is slow or misbehaving
    await wsServer.start();
    logger.info("Server running!", "MAIN");
    logger.info("Loading card reader support...", "NFC");
    await nfcReader.initialize();
    logger.info(`  WebSocket: ${config.sslEnabled ? "wss" : "ws"}://localhost:${config.port}`, "MAIN");
    logger.info(`  Health: http://localhost:${config.port}/health`, "MAIN");
  } catch (err: any) {
    if (err.code === "EADDRINUSE") {
      logger.error(
        `The NFC Bridge is already running (port ${config.port} is in use). ` +
        "Use the window where it's already running, or close it before starting a new one.",
        "MAIN"
      );
    } else {
      logger.error(`Failed to start: ${err.message}`, "MAIN");
    }
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down...`, "MAIN");
  await wsServer.stop();
  nfcReader.shutdown();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (process.argv.includes("--reader-process")) {
  runReaderProcess().catch(console.error);
} else {
  main().catch(console.error);
}
