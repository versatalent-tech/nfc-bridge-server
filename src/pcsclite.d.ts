declare module 'pcsclite' {
  export interface Reader {
    name: string;
    state: number;
    SCARD_STATE_PRESENT: number;
    SCARD_SHARE_SHARED: number;
    SCARD_LEAVE_CARD: number;
    on(event: 'status', listener: (status: { state: number; atr?: Buffer }) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    connect(options: { share_mode: number }, callback: (err: Error | null, protocol: number) => void): void;
    transmit(data: Buffer, resLen: number, protocol: number, callback: (err: Error | null, data: Buffer) => void): void;
    disconnect(disposition: number, callback: () => void): void;
    close(): void;
  }

  export interface PCSC {
    on(event: 'reader', listener: (reader: Reader) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    close(): void;
  }

  function pcsclite(): PCSC;
  export default pcsclite;
}
