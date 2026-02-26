import { EventEmitter } from "events";
import { logger } from "./logger";

const APDU_GET_UID = Buffer.from([0xff, 0xca, 0x00, 0x00, 0x00]);

export class NFCReader extends EventEmitter {
  private pcsc: any = null;
  private reader: any = null;
  private readerName: string | null = null;
  private cardPresent = false;
  private lastUID: string | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const pcsclite = await import("pcsclite");
      this.pcsc = pcsclite.default();
      logger.info("PC/SC initialized", "NFC");

      this.pcsc.on("reader", (reader: any) => this.handleReader(reader));
      this.pcsc.on("error", (err: Error) => this.emit("error", err));
      this.isInitialized = true;
      this.emit("ready");
    } catch (err: any) {
      if (err.message?.includes("Cannot find module") || err.message?.includes("bindings")) {
        logger.warn("pcsclite not available - running in WebSocket-only mode", "NFC");
        this.isInitialized = true;
        this.emit("ready");
        return;
      }
      throw err;
    }
  }

  private handleReader(reader: any) {
    this.reader = reader;
    this.readerName = reader.name;
    logger.info(`Reader: ${reader.name}`, "NFC");
    this.emit("readerConnected", reader.name);

    reader.on("status", (status: any) => {
      const changes = reader.state ^ status.state;
      if (changes & reader.SCARD_STATE_PRESENT) {
        const inserted = !!(status.state & reader.SCARD_STATE_PRESENT);
        if (inserted && !this.cardPresent) {
          this.cardPresent = true;
          this.readCard(status.atr);
        } else if (!inserted && this.cardPresent) {
          this.cardPresent = false;
          this.lastUID = null;
          this.emit("cardRemoved");
        }
      }
    });

    reader.on("end", () => {
      this.emit("readerDisconnected", reader.name);
      this.reader = null;
    });
  }

  private readCard(atr: Buffer) {
    if (!this.reader) return;

    this.reader.connect({ share_mode: this.reader.SCARD_SHARE_SHARED }, (err: Error, protocol: number) => {
      if (err) return;
      this.reader.transmit(APDU_GET_UID, 255, protocol, (err: Error, data: Buffer) => {
        if (!err && data.length >= 2) {
          const status = (data[data.length - 2] << 8) | data[data.length - 1];
          if (status === 0x9000) {
            const uid = data.slice(0, -2).toString("hex").toUpperCase();
            this.lastUID = uid;
            this.emit("cardInserted", uid, atr?.toString("hex") || "");
          }
        }
        this.reader.disconnect(this.reader.SCARD_LEAVE_CARD, () => {});
      });
    });
  }

  getInfo() {
    return { name: this.readerName || "No reader", connected: !!this.reader, cardPresent: this.cardPresent, lastUID: this.lastUID };
  }

  shutdown() {
    if (this.reader) try { this.reader.close(); } catch {}
    if (this.pcsc) try { this.pcsc.close(); } catch {}
    this.isInitialized = false;
  }
}

export const nfcReader = new NFCReader();
