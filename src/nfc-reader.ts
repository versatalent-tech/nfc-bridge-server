import { EventEmitter } from "events";
import { logger } from "./logger";
import { buildUrlTlv, padToPages, MAX_URL_LENGTH } from "./ndef";

const APDU_GET_UID = Buffer.from([0xff, 0xca, 0x00, 0x00, 0x00]);

// NTAG21x layout: capability container in page 3, user data from page 4
const CC_PAGE = 3;
const DATA_START_PAGE = 4;

/** An error whose message can be shown to the person at the reader */
export class CardWriteError extends Error {}

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
      logger.info("Card reader module loaded", "NFC");
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
      logger.info("Connecting to smart card service...", "NFC");
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

  /**
   * Write a web address to the card on the reader so phones open it when
   * they tap the card. Only NFC Forum Type 2 cards (NTAG213/215/216) are
   * supported. When expectedUid is given, the card on the reader must have
   * that UID, so the address can't end up on the wrong card.
   */
  async writeUrl(url: string, expectedUid?: string): Promise<{ uid: string; bytes: number; capacity: number }> {
    if (!/^https?:\/\//.test(url) || url.length > MAX_URL_LENGTH) {
      throw new CardWriteError("Invalid address");
    }
    if (!this.reader) throw new CardWriteError("No card reader connected");
    if (!this.cardPresent) throw new CardWriteError("Place the card on the reader");

    const protocol = await this.connect();
    try {
      const uid = (await this.command(protocol, APDU_GET_UID)).toString("hex").toUpperCase();
      if (expectedUid && uid !== expectedUid.toUpperCase()) {
        throw new CardWriteError(`The card on the reader (${uid}) isn't the one being set up (${expectedUid.toUpperCase()})`);
      }

      let cc: Buffer;
      try {
        cc = (await this.readPages(protocol, CC_PAGE)).subarray(0, 4);
      } catch {
        throw new CardWriteError("This card type isn't supported. Use NTAG213, NTAG215 or NTAG216 cards.");
      }
      if (cc[0] !== 0xe1) {
        throw new CardWriteError("This card isn't formatted for NFC addresses. Use NTAG213, NTAG215 or NTAG216 cards.");
      }
      if ((cc[3] & 0x0f) !== 0x00) {
        throw new CardWriteError("This card is locked and can't be written");
      }

      const capacity = cc[2] * 8;
      const data = padToPages(buildUrlTlv(url));
      if (data.length > capacity) {
        throw new CardWriteError(`The address is too long for this card (${data.length} of ${capacity} bytes)`);
      }

      for (let offset = 0; offset < data.length; offset += 4) {
        const page = DATA_START_PAGE + offset / 4;
        try {
          await this.command(protocol, Buffer.concat([Buffer.from([0xff, 0xd6, 0x00, page, 0x04]), data.subarray(offset, offset + 4)]));
        } catch {
          throw new CardWriteError("Writing failed — keep the card still on the reader and try again. If it keeps failing, the card may be locked.");
        }
      }

      // Read back and compare, so a card moved mid-write isn't reported as done
      const written: Buffer[] = [];
      for (let page = DATA_START_PAGE; page < DATA_START_PAGE + data.length / 4; page += 4) {
        written.push(await this.readPages(protocol, page));
      }
      if (!Buffer.concat(written).subarray(0, data.length).equals(data)) {
        throw new CardWriteError("The card didn't save the address correctly — try again");
      }

      logger.info(`Wrote ${url} to card ${uid}`, "NFC");
      return { uid, bytes: data.length, capacity };
    } finally {
      this.reader?.disconnect(this.reader.SCARD_LEAVE_CARD, () => {});
    }
  }

  private connect(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.reader.connect({ share_mode: this.reader.SCARD_SHARE_SHARED }, (err: Error, protocol: number) => {
        if (err) reject(new CardWriteError("Couldn't connect to the card — place it flat on the reader"));
        else resolve(protocol);
      });
    });
  }

  /** Send an APDU; resolves with the response data when the status is 90 00 */
  private command(protocol: number, apdu: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.reader.transmit(apdu, 255, protocol, (err: Error, data: Buffer) => {
        if (err) return reject(err);
        const status = data.length >= 2 ? (data[data.length - 2] << 8) | data[data.length - 1] : 0;
        if (status !== 0x9000) return reject(new Error(`Card returned status ${status.toString(16)}`));
        resolve(data.subarray(0, -2));
      });
    });
  }

  /** READ BINARY returns 4 pages (16 bytes) starting at the given page */
  private async readPages(protocol: number, page: number): Promise<Buffer> {
    const data = await this.command(protocol, Buffer.from([0xff, 0xb0, 0x00, page, 0x10]));
    if (data.length < 16) throw new Error("Short read");
    return data;
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
