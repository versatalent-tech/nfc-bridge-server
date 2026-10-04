/**
 * Main-process side of the NFC reader: starts the reader child process,
 * restarts it if it exits, and re-emits its events. Exposes the same
 * interface the WebSocket server used from NFCReader.
 */
import { EventEmitter } from "events";
import { fork, ChildProcess } from "child_process";
import { logger } from "./logger";
import type { ReaderMessage, ReaderRequest } from "./reader-process";

const RESTART_DELAY_MS = 5000;
// Writing a URL takes well under a second; this only guards a stuck reader
const WRITE_TIMEOUT_MS = 15000;

export type WriteResult =
  | { ok: true; uid: string; bytes: number; capacity: number }
  | { ok: false; error: string };

class ReaderHost extends EventEmitter {
  private child: ChildProcess | null = null;
  private stopping = false;
  private readerName: string | null = null;
  private cardPresent = false;
  private lastUID: string | null = null;
  private pendingWrites = new Map<string, (result: WriteResult) => void>();
  private nextRequestId = 1;

  async initialize(): Promise<void> {
    this.start();
  }

  private start() {
    // fork re-runs this program with --reader-process: node + script in
    // development, the packaged binary itself under pkg
    this.child = fork(process.argv[1], ["--reader-process"], {
      execArgv: process.execArgv,
      stdio: ["ignore", "inherit", "inherit", "ipc"],
    });

    this.child.on("message", (message: ReaderMessage) => this.handleMessage(message));
    this.child.on("exit", (code) => {
      this.child = null;
      this.failPendingWrites("The card reader restarted — try again");
      this.readerName = null;
      this.cardPresent = false;
      if (this.stopping) return;
      logger.warn(`Card reader process exited (code ${code}); restarting in ${RESTART_DELAY_MS / 1000}s`, "NFC");
      setTimeout(() => this.start(), RESTART_DELAY_MS);
    });
  }

  private handleMessage(message: ReaderMessage) {
    switch (message.type) {
      case "readerConnected":
        this.readerName = message.name;
        this.emit("readerConnected", message.name);
        break;
      case "readerDisconnected":
        this.readerName = null;
        this.cardPresent = false;
        this.emit("readerDisconnected", message.name);
        break;
      case "cardInserted":
        this.cardPresent = true;
        this.lastUID = message.uid;
        this.emit("cardInserted", message.uid, message.atr);
        break;
      case "cardRemoved":
        this.cardPresent = false;
        this.lastUID = null;
        this.emit("cardRemoved");
        break;
      case "error":
        this.emit("error", new Error(message.message));
        break;
      case "writeResult": {
        const resolve = this.pendingWrites.get(message.requestId);
        if (!resolve) break;
        this.pendingWrites.delete(message.requestId);
        const { type, requestId, ...result } = message;
        resolve(result);
        break;
      }
    }
  }

  /** Write a web address to the card on the reader (see NFCReader.writeUrl) */
  writeUrl(url: string, uid?: string): Promise<WriteResult> {
    if (!this.child?.connected) {
      return Promise.resolve({ ok: false, error: "The card reader isn't ready yet — try again in a moment" });
    }
    if (this.pendingWrites.size > 0) {
      return Promise.resolve({ ok: false, error: "Another card is being written — wait a moment" });
    }
    const requestId = String(this.nextRequestId++);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pendingWrites.delete(requestId);
        resolve({ ok: false, error: "The card reader didn't respond — try again" });
      }, WRITE_TIMEOUT_MS);
      this.pendingWrites.set(requestId, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
      const request: ReaderRequest = { type: "writeUrl", requestId, url, uid };
      this.child!.send(request);
    });
  }

  private failPendingWrites(error: string) {
    for (const resolve of this.pendingWrites.values()) resolve({ ok: false, error });
    this.pendingWrites.clear();
  }

  getInfo() {
    return { name: this.readerName || "No reader", connected: !!this.readerName, cardPresent: this.cardPresent, lastUID: this.lastUID };
  }

  shutdown() {
    this.stopping = true;
    this.child?.kill();
  }
}

export const nfcReader = new ReaderHost();
