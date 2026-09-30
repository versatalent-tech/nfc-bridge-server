/**
 * Runs in a child process (started with --reader-process) and forwards
 * NFC reader events to the main process over IPC.
 *
 * PC/SC calls can block (on Windows the first call blocks while no reader
 * is plugged in), so they must not share an event loop with the HTTP and
 * WebSocket server.
 */
import { NFCReader } from "./nfc-reader";
import { logger } from "./logger";

export type ReaderMessage =
  | { type: "readerConnected"; name: string }
  | { type: "readerDisconnected"; name: string }
  | { type: "cardInserted"; uid: string; atr: string }
  | { type: "cardRemoved" }
  | { type: "error"; message: string };

function send(message: ReaderMessage) {
  process.send?.(message);
}

export async function runReaderProcess() {
  const reader = new NFCReader();
  reader.on("readerConnected", (name: string) => send({ type: "readerConnected", name }));
  reader.on("readerDisconnected", (name: string) => send({ type: "readerDisconnected", name }));
  reader.on("cardInserted", (uid: string, atr: string) => send({ type: "cardInserted", uid, atr }));
  reader.on("cardRemoved", () => send({ type: "cardRemoved" }));
  reader.on("error", (err: Error) => send({ type: "error", message: err.message }));

  // Exit with the main process
  process.on("disconnect", () => {
    reader.shutdown();
    process.exit(0);
  });

  try {
    await reader.initialize();
  } catch (err: any) {
    logger.error(`Card reader failed to start: ${err.message}`, "NFC");
    process.exit(1);
  }
}
