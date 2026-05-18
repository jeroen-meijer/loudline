#!/usr/bin/env sh
# Encode a .p12 for the APPLE_CERTIFICATE GitHub secret.
# Usage: ./tool/encode_apple_certificate.sh /path/to/certificate.p12

set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: $0 /path/to/certificate.p12" >&2
  exit 2
fi

P12="$1"
if [ ! -f "$P12" ]; then
  echo "error: file not found: $P12" >&2
  exit 1
fi

if command -v pbcopy >/dev/null 2>&1; then
  openssl base64 -A -in "$P12" | pbcopy
  echo "Base64 copied to clipboard."
else
  openssl base64 -A -in "$P12"
  echo "(Install pbcopy on macOS to copy to clipboard automatically.)"
fi

echo "Set secret: gh secret set APPLE_CERTIFICATE < <(openssl base64 -A -in \"$P12\")"
