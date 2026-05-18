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

B64="$(openssl base64 -A -in "$P12")"
OUT="$(mktemp)"
printf '%s' "$B64" > "$OUT"

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$B64" | pbcopy
  echo "Base64 copied to clipboard."
fi

echo "Also saved to: $OUT"
echo ""
echo "Add GitHub secret APPLE_CERTIFICATE with this value (or: gh secret set APPLE_CERTIFICATE < \"$OUT\")."
