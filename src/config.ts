import { existsSync } from "fs";
import { resolve, dirname } from "path";

const isPkg = typeof (process as any).pkg !== 'undefined';
const execDir = isPkg ? dirname(process.execPath) : resolve(__dirname, "..");

export interface BridgeConfig {
  port: number;
  host: string;
  sslEnabled: boolean;
  certPath: string;
  keyPath: string;
  allowedOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULT_ORIGINS = [
  "https://versatalent.netlify.app",
  "http://localhost:3000",
  "https://localhost:3000",
];

function findCertificates() {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const locations = [
    { cert: resolve(execDir, "localhost.pem"), key: resolve(execDir, "localhost-key.pem") },
    { cert: resolve(execDir, "certs", "localhost.pem"), key: resolve(execDir, "certs", "localhost-key.pem") },
    { cert: resolve(homeDir, ".nfc-bridge", "certs", "localhost.pem"), key: resolve(homeDir, ".nfc-bridge", "certs", "localhost-key.pem") },
  ];

  for (const loc of locations) {
    if (existsSync(loc.cert) && existsSync(loc.key)) {
      return { certPath: loc.cert, keyPath: loc.key, exists: true };
    }
  }
  return { certPath: locations[0].cert, keyPath: locations[0].key, exists: false };
}

const certs = findCertificates();

export const config: BridgeConfig = {
  port: parseInt(process.env.NFC_BRIDGE_PORT || "9876", 10),
  host: process.env.NFC_BRIDGE_HOST || "localhost",
  sslEnabled: process.env.NFC_BRIDGE_SSL === "true" || certs.exists,
  certPath: certs.certPath,
  keyPath: certs.keyPath,
  allowedOrigins: process.env.NFC_ALLOWED_ORIGINS?.split(",") || DEFAULT_ORIGINS,
  logLevel: (process.env.NFC_LOG_LEVEL as BridgeConfig["logLevel"]) || "info",
};
