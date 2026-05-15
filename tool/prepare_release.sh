#!/usr/bin/env sh
# Prepare a release PR: changelog, package.json + Tauri version sync, lint/build, commit, gh pr.
# Usage: ./tool/prepare_release.sh <x.y.z>
# Requires: git, gh, bun, awk; run from repo root.

set -eu

ROOT="$(CDPATH='' cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CHANGELOG_PATH="CHANGELOG.md"
PACKAGE_PATH="package.json"
CHANGELOG_REWRITE_SCRIPT="$ROOT/tool/rewrite_changelog_for_release.sh"

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <x.y.z>" >&2
  exit 2
fi
VERSION="$1"

echo "$VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || {
  echo "error: version must be semver x.y.z (e.g. 1.3.0)" >&2
  exit 2
}

BRANCH="chore/release-${VERSION}"
if git show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  echo "error: branch ${BRANCH} already exists." >&2
  exit 1
fi

git checkout -b "$BRANCH"

"$CHANGELOG_REWRITE_SCRIPT" "$VERSION" \
  "$ROOT/$CHANGELOG_PATH" "$ROOT/$CHANGELOG_PATH"

bun tool/sync-version.ts "$VERSION"

if ! bun run lint; then
  echo "error: bun run lint failed; fix issues and retry." >&2
  exit 1
fi

if ! bun run build; then
  echo "error: bun run build failed; fix issues and retry." >&2
  exit 1
fi

git add "$CHANGELOG_PATH" "$PACKAGE_PATH" src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: prepare release ${VERSION}"

git push -u origin "$BRANCH"

gh pr create \
  --title "chore: release ${VERSION}" \
  --body "Prepare release **${VERSION}**: changelog section, \`package.json\` version, and Tauri metadata (via \`tool/sync-version.ts\`).

Merge with **squash** after CI passes. Then tag \`${VERSION}\` on \`main\` and push the tag to publish to GitHub Pages and create a GitHub release:

\`\`\`bash
git checkout main && git pull
git tag ${VERSION}
git push origin ${VERSION}
\`\`\`"

echo "Created branch ${BRANCH} and opened a PR."
