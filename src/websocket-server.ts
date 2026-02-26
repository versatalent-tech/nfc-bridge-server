import { WebSocketServer, WebSocket } from "ws";
import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { readFileSync, existsSync } from "fs";
import express from "express";
import cors from "cors";
import { config } from "./config";
import { logger } from "./logger";
import { nfcReader } from "./nfc-reader";

interface Client { id: string; ws: WebSocket; isScanning: boolean; }

export class BridgeServer {
  private server: any = null;
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, Client>();
  private app = express();

  constructor() {
    this.app.use(cors({ origin: config.allowedOrigins }));
    this.app.use(express.json());
    this.app.get("/health", (_, res) => res.json({ status: "ok", version: "1.0.0", reader: nfcReader.getInfo(), clients: this.clients.size }));
    this.app.get("/", (_, res) => res.send(`<h1>NFC Bridge Server</h1><p>Reader: ${nfcReader.getInfo().connected ? nfcReader.getInfo().name : "Not connected"}</p><p>Clients: ${this.clients.size}</p>`));
  }

  async start() {
    if (config.sslEnabled && existsSync(config.certPath) && existsSync(config.keyPath)) {
      this.server = createHttpsServer({ cert: readFileSync(config.certPath), key: readFileSync(config.keyPath) }, this.app);
      logger.info("Starting secure server (WSS)", "WS");
    } else {
      this.server = createHttpServer(this.app);
      logger.info("Starting server (WS)", "WS");
    }

    this.wss = new WebSocketServer({ server: this.server });
    this.wss.on("connection", (ws, req) => this.handleConnection(ws, req.headers.origin || null));
    this.setupNFCEvents();

    await new Promise<void>((resolve) => {
      this.server.listen(config.port, config.host, () => {
        logger.info(`Listening on ${config.sslEnabled ? "wss" : "ws"}://${config.host}:${config.port}`, "WS");
        resolve();
      });
    });
  }

  private handleConnection(ws: WebSocket, origin: string | null) {
    const id = Math.random().toString(36).slice(2, 10);
    const client: Client = { id, ws, isScanning: false };
    this.clients.set(id, client);
    logger.info(`Client connected: ${id}`, "WS");
    this.send(client, { type: "connected", clientId: id, reader: nfcReader.getInfo() });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg.type === "getDeviceInfo") this.send(client, { type: "deviceInfo", ...nfcReader.getInfo() });
        else if (msg.type === "startScanning") { client.isScanning = true; this.send(client, { type: "scanningStarted" }); }
        else if (msg.type === "stopScanning") { client.isScanning = false; this.send(client, { type: "scanningStopped" }); }
      } catch {}
    });

    ws.on("close", () => { this.clients.delete(id); logger.info(`Client disconnected: ${id}`, "WS"); });
  }

  private setupNFCEvents() {
    nfcReader.on("cardInserted", (uid: string, atr: string) => {
      this.broadcast({ type: "cardScanned", uid, atr, timestamp: Date.now() }, true);
    });
    nfcReader.on("cardRemoved", () => this.broadcast({ type: "cardRemoved" }, true));
    nfcReader.on("readerConnected", (name: string) => this.broadcast({ type: "readerConnected", deviceName: name }));
    nfcReader.on("readerDisconnected", (name: string) => this.broadcast({ type: "readerDisconnected", deviceName: name }));
  }

  private send(client: Client, msg: object) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.send(JSON.stringify(msg));
  }

  private broadcast(msg: object, scanningOnly = false) {
    for (const client of this.clients.values()) {
      if (!scanningOnly || client.isScanning) this.send(client, msg);
    }
  }

  async stop() {
    for (const client of this.clients.values()) client.ws.close();
    this.clients.clear();
    if (this.wss) await new Promise<void>(r => this.wss!.close(() => r()));
    if (this.server) await new Promise<void>(r => this.server.close(() => r()));
  }
}

export const wsServer = new BridgeServer();
