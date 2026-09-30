/**
 * Main-process side of the NFC reader: starts the reader child process,
 * restarts it if it exits, and re-emits its events. Exposes the same
 * interface the WebSocket server used from NFCReader.
 */
import { EventEmitter } from "events";
import { fork, ChildProcess } from "child_process";
import { logger } from "./logger";
import type { ReaderMessage } from "./reader-process";

const RESTART_DELAY_MS = 5000;

class ReaderHost extends EventEmitter {
  private child: ChildProcess | null = null;
  private stopping = false;
  private readerName: string | null = null;
  private cardPresent = false;
  private lastUID: string | null = null;

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
    }
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
