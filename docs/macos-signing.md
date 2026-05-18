# macOS release signing and notarization

GitHub Actions signs and notarizes the macOS `.dmg` when the secrets below are configured.

## What you do once (manual)

### 1. Certificate (done locally)

You need **Developer ID Application** in Keychain (valid). Verify:

```bash
security find-identity -v -p codesigning | grep "Developer ID Application"
```

### 2. Export `.p12` for CI

1. Keychain Access → **My Certificates**
2. Expand **Developer ID Application: …**
3. Right-click the **private key** → **Export** → `.p12` with a strong password

Encode for GitHub secret `APPLE_CERTIFICATE`:

```bash
./tool/encode_apple_certificate.sh ~/path/to/certificate.p12
# copies base64 to clipboard (macOS) and prints reminder
```

### 3. App Store Connect API key (notarization)

1. [App Store Connect → Users and Access → Integrations → API](https://appstoreconnect.apple.com/access/integrations/api)
2. Generate a key (role **Developer** or **Admin**)
3. Download the `.p8` once; note **Issuer ID** and **Key ID**

### 4. GitHub repository secrets

Settings → Secrets and variables → Actions → **New repository secret**:

| Secret | Value |
|--------|--------|
| `APPLE_CERTIFICATE` | Base64 from step 2 |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` export password |
| `KEYCHAIN_PASSWORD` | Random string (`openssl rand -base64 32`) |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Jeroen Meijer (8Y9VHETSCL)` |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect |
| `APPLE_API_KEY` | Key ID |
| `APPLE_API_KEY_CONTENT` | Full contents of `AuthKey_XXXXX.p8` |

Optional: `gh secret set APPLE_CERTIFICATE < certificate-base64.txt` (repeat per secret).

### 5. Merge CI changes and ship a release

After secrets exist, merge the signing workflow PR and run a normal release (`prepare_release.sh` → merge). The macOS job will sign + notarize the `.dmg`.

## Local test (optional)

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Jeroen Meijer (8Y9VHETSCL)"
export APPLE_API_ISSUER="your-issuer-id"
export APPLE_API_KEY="your-key-id"
export APPLE_API_KEY_PATH="$HOME/.appstoreconnect/private_keys/AuthKey_XXXXX.p8"

bun run tauri build
spctl -a -vv -t install src-tauri/target/release/bundle/macos/*.app
```

## Troubleshooting

- **“Damaged” on download** — unsigned or unnotarized build; re-download after a signed release.
- **Import -25294** — CSR/private key mismatch; revoke cert and recreate CSR on the same Mac.
- **Notarization fails in CI** — check API key role, Issuer ID, and that `AuthKey_*.p8` filename matches `APPLE_API_KEY`.
