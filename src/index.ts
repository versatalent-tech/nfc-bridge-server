#!/usr/bin/env node
import { config } from "./config";
import { logger } from "./logger";
import { nfcReader } from "./nfc-reader";
import { wsServer } from "./websocket-server";

const BANNER = `
╔═══════════════════════════════════════════════════════════════╗
║                 NFC Bridge Server v1.0.0                      ║
║            For VersaTalent Talent Management                  ║
╚═══════════════════════════════════════════════════════════════╝
`;

async function main() {
  console.log(BANNER);
  logger.info(`Port: ${config.port}, SSL: ${config.sslEnabled}`, "MAIN");

  try {
    await nfcReader.initialize();
    nfcReader.on("cardInserted", (uid) => logger.info(`Card: ${uid}`, "NFC"));
    await wsServer.start();
    logger.info("Server running!", "MAIN");
    logger.info(`  WebSocket: ${config.sslEnabled ? "wss" : "ws"}://localhost:${config.port}`, "MAIN");
    logger.info(`  Health: http://localhost:${config.port}/health`, "MAIN");
  } catch (err: any) {
    logger.error(`Failed to start: ${err.message}`, "MAIN");
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

main().catch(console.error);
