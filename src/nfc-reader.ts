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

  private retryTimer: NodeJS.Timeout | null = null;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    let pcsclite: any;
    try {
      pcsclite = (await import("@pokusew/pcsclite")).default;
    } catch (err: any) {
      // Native module missing or built for another platform/Node version
      logger.warn(`pcsclite not available - running in WebSocket-only mode (cards will NOT be read): ${err.message}`, "NFC");
      this.isInitialized = true;
      this.emit("ready");
      return;
    }

    this.isInitialized = true;
    this.connectPCSC(pcsclite);
    this.emit("ready");
  }

  /**
   * Connect to the system smart card service. If it isn't running yet
   * (pcscd on Linux, "Smart Card" service on Windows), keep the bridge up
   * and retry, so starting the service or plugging in a reader later works.
   */
  private connectPCSC(pcsclite: () => any) {
    try {
      this.pcsc = pcsclite();
      logger.info("PC/SC initialized", "NFC");
      this.pcsc.on("reader", (reader: any) => this.handleReader(reader));
      this.pcsc.on("error", (err: Error) => this.emit("error", err));
    } catch (err: any) {
      logger.warn(
        `Smart card service not available (${err.message}). ` +
        "On Linux run: sudo systemctl start pcscd. On Windows, start the \"Smart Card\" service. Retrying in 5s...",
        "NFC"
      );
      this.retryTimer = setTimeout(() => this.connectPCSC(pcsclite), 5000);
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
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.reader) try { this.reader.close(); } catch {}
    if (this.pcsc) try { this.pcsc.close(); } catch {}
    this.isInitialized = false;
  }
}

export const nfcReader = new NFCReader();
