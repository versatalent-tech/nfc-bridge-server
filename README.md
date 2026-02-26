# NFC Bridge Server

A local bridge server that connects ACR122U NFC readers to the VersaTalent web application. This server solves the browser limitation where CCID/Smart Card devices cannot be accessed directly via WebUSB or WebHID.

## Why is this needed?

Modern web browsers block direct access to NFC readers like the ACR122U because they use the protected CCID (Chip Card Interface Device) USB class. The NFC Bridge Server runs locally on your computer and provides a WebSocket connection that the VersaTalent web app can use to communicate with your physical NFC reader.

## Quick Start

### 1. Download

Download the appropriate executable for your operating system from the [releases](https://github.com/versatalent-tech/nfc-bridge-server/releases):

| Platform | File | Architecture |
|----------|------|--------------|
| Windows | `nfc-bridge-win-x64.exe` | Intel/AMD 64-bit |
| macOS (Intel) | `nfc-bridge-macos-x64` | Intel |
| macOS (Apple Silicon) | `nfc-bridge-macos-arm64` | M1/M2/M3 |
| Linux | `nfc-bridge-linux-x64` | Intel/AMD 64-bit |
| Linux ARM | `nfc-bridge-linux-arm64` | ARM64 (Raspberry Pi, etc.) |

### 2. Install NFC Reader Drivers

#### Windows
- The ACR122U usually works out of the box on Windows 10/11
- If not detected, download drivers from [ACS website](https://www.acs.com.hk/en/driver/3/acr122u-usb-nfc-reader/)

#### macOS
- Install the CCID driver: No additional drivers needed on modern macOS

#### Linux
- Install PC/SC daemon:
  ```bash
  sudo apt install pcscd pcsc-tools
  sudo systemctl start pcscd
  sudo systemctl enable pcscd
  ```

### 3. Run the Server

#### Windows
Double-click `nfc-bridge-win-x64.exe`

#### macOS
```bash
chmod +x nfc-bridge-macos-arm64  # or macos-x64
./nfc-bridge-macos-arm64
```

Note: macOS may show a security warning. Go to System Preferences > Security & Privacy to allow the app.

#### Linux
```bash
chmod +x nfc-bridge-linux-x64
./nfc-bridge-linux-x64
```

### 4. Connect Your NFC Reader

1. Plug in your ACR122U NFC reader via USB
2. The server will automatically detect it
3. Open VersaTalent and go to Admin > NFC Management
4. Click "Connect Bridge" to connect to the server

## Features

- **WebSocket Server**: Connects to VersaTalent web app via WebSocket
- **Auto-detection**: Automatically detects when NFC reader is plugged in
- **Card Reading**: Reads NFC card UIDs when cards are tapped
- **CORS Support**: Allows connections from authorized web origins
- **SSL Support**: Optional HTTPS/WSS for secure connections

## Configuration

The server can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `NFC_BRIDGE_PORT` | 9876 | WebSocket server port |
| `NFC_BRIDGE_HOST` | localhost | Server host |
| `NFC_BRIDGE_SSL` | auto | Enable SSL (auto-detects certificates) |
| `NFC_ALLOWED_ORIGINS` | (see below) | Comma-separated list of allowed origins |
| `NFC_LOG_LEVEL` | info | Logging level (debug, info, warn, error) |

Default allowed origins:
- https://versatalent.netlify.app
- http://localhost:3000
- https://localhost:3000

## SSL Setup (Optional)

For secure WebSocket connections (WSS) from HTTPS websites:

### Using mkcert (Recommended)

1. Install mkcert:
   - **macOS**: `brew install mkcert`
   - **Ubuntu**: `sudo apt install mkcert`
   - **Windows**: `choco install mkcert`

2. Run the certificate generator:
   - **macOS/Linux**: `./scripts/generate-certs.sh`
   - **Windows**: `scripts\generate-certs.bat`

3. The server will automatically use the certificates

### Manual Certificate Placement

Place certificates in one of these locations:
- Same directory as the executable: `localhost.pem` and `localhost-key.pem`
- In a `certs` subdirectory
- In `~/.nfc-bridge/certs/`

## API

### WebSocket Messages

**Client to Server:**
```json
{"type": "getDeviceInfo"}
{"type": "startScanning"}
{"type": "stopScanning"}
```

**Server to Client:**
```json
{"type": "connected", "clientId": "abc123", "reader": {...}}
{"type": "cardScanned", "uid": "04AABBCCDD", "atr": "...", "timestamp": 1234567890}
{"type": "cardRemoved"}
{"type": "readerConnected", "deviceName": "ACR122U"}
{"type": "readerDisconnected", "deviceName": "ACR122U"}
```

### HTTP Endpoints

- `GET /health` - Health check endpoint
- `GET /` - Server info page

## Troubleshooting

### "No NFC reader detected"
- Make sure the ACR122U is plugged in
- Check USB connection and try a different port
- On Linux, ensure pcscd service is running

### "Failed to connect to bridge"
- Make sure the NFC Bridge Server is running
- Check if port 9876 is available
- Try disabling firewall temporarily

### macOS "App is damaged" error
Run this command in Terminal:
```bash
xattr -cr /path/to/nfc-bridge-macos-arm64
```

### Linux permission errors
Add your user to the pcscd group or run with sudo:
```bash
sudo usermod -a -G pcscd $USER
# Then log out and back in
```

## Building from Source

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Build all platform executables
npm run release
```

## License

MIT License - Copyright (c) VersaTalent
