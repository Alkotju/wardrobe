#!/usr/bin/env bash
# Generate a self-signed TLS cert for local/dev deployment.
# For production, replace with Let's Encrypt (certbot) or your CA's cert.
#
# Usage:
#   ./generate-self-signed.sh [common-name]
#
# Outputs:  nginx/certs/server.crt, nginx/certs/server.key
set -euo pipefail

CN="${1:-localhost}"
CERT_DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$CERT_DIR"

# MSYS_NO_PATHCONV=1 stops Git Bash on Windows from rewriting "/CN=..." into a
# Windows path. No-op on Linux/macOS, required on Windows.
MSYS_NO_PATHCONV=1 openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$CERT_DIR/server.key" \
  -out    "$CERT_DIR/server.crt" \
  -days 365 \
  -subj "/CN=$CN" \
  -addext "subjectAltName=DNS:$CN,DNS:localhost,IP:127.0.0.1"

chmod 600 "$CERT_DIR/server.key"
echo "Wrote $CERT_DIR/server.{crt,key} for CN=$CN"
