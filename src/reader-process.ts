/**
 * Runs in a child process (started with --reader-process) and forwards
 * NFC reader events to the main process over IPC.
 *
 * PC/SC calls can block (on Windows the first call blocks while no reader
 * is plugged in), so they must not share an event loop with the HTTP and
 * WebSocket server.
 */
import { NFCReader, CardWriteError } from "./nfc-reader";
import { logger } from "./logger";

export type ReaderMessage =
  | { type: "readerConnected"; name: string }
  | { type: "readerDisconnected"; name: string }
  | { type: "cardInserted"; uid: string; atr: string }
  | { type: "cardRemoved" }
  | { type: "error"; message: string }
  | { type: "writeResult"; requestId: string; ok: true; uid: string; bytes: number; capacity: number }
  | { type: "writeResult"; requestId: string; ok: false; error: string };

/** Requests from the main process */
export type ReaderRequest = { type: "writeUrl"; requestId: string; url: string; uid?: string };

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

  process.on("message", async (request: ReaderRequest) => {
    if (request?.type !== "writeUrl") return;
    try {
      const result = await reader.writeUrl(request.url, request.uid);
      send({ type: "writeResult", requestId: request.requestId, ok: true, ...result });
    } catch (err: any) {
      if (!(err instanceof CardWriteError)) logger.error(`Card write failed: ${err.message}`, "NFC");
      const error = err instanceof CardWriteError ? err.message : "Writing to the card failed — try again";
      send({ type: "writeResult", requestId: request.requestId, ok: false, error });
    }
  });

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
