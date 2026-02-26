#!/bin/bash
# Generate self-signed SSL certificates for NFC Bridge Server
# This enables secure WebSocket (WSS) connections from HTTPS websites

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CERTS_DIR="${SCRIPT_DIR}/../certs"

# Create certs directory if it doesn't exist
mkdir -p "$CERTS_DIR"

echo "🔐 Generating self-signed SSL certificates..."
echo "   Output directory: $CERTS_DIR"

# Check if mkcert is available (preferred method)
if command -v mkcert &> /dev/null; then
    echo "✅ Using mkcert for certificate generation"
    # Install local CA (if not already done)
    mkcert -install 2>/dev/null || true
    # Generate certificates
    cd "$CERTS_DIR"
    mkcert -key-file localhost-key.pem -cert-file localhost.pem localhost 127.0.0.1 ::1
    echo "✅ Certificates generated with mkcert"
else
    echo "⚠️  mkcert not found, using openssl (certificates won't be trusted by default)"
    # Generate using openssl
    openssl req -x509 -newkey rsa:2048 -nodes \
        -keyout "$CERTS_DIR/localhost-key.pem" \
        -out "$CERTS_DIR/localhost.pem" \
        -days 365 \
        -subj "/CN=localhost" \
        -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1" \
        2>/dev/null
    echo "⚠️  Certificates generated with openssl"
    echo "   Note: You may need to manually trust these certificates"
fi

echo ""
echo "📁 Certificate files:"
ls -la "$CERTS_DIR"/*.pem
echo ""
echo "✅ Done! Place the NFC Bridge executable in the same directory as the certs folder,"
echo "   or set NFC_BRIDGE_SSL=true to enable SSL."
echo ""
echo "To install mkcert (recommended):"
echo "  macOS:  brew install mkcert"
echo "  Ubuntu: sudo apt install mkcert"
echo "  Windows: choco install mkcert"
