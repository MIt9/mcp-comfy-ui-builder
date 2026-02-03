#!/usr/bin/env bash
# Publish: read version from package.json, push git, npm publish, docker tag & push.
# Run from repo root or any dir (script cd's to repo root).
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('package.json','utf8')).version)")"
echo "Version from package.json: $VERSION"

# Ensure server.json version matches
SERVER_VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('server.json','utf8')).version)")"
if [ "$SERVER_VERSION" != "$VERSION" ]; then
  echo "server.json version ($SERVER_VERSION) does not match package.json ($VERSION)." >&2
  exit 1
fi

# Ensure CHANGELOG has section for the version
if ! grep -q "## \\[$VERSION\\]" CHANGELOG.md; then
  echo "CHANGELOG.md does not have section for version $VERSION." >&2
  exit 1
fi

echo "--- git tag (create if missing) ---"
if git rev-parse "v${VERSION}" >/dev/null 2>&1; then
  echo "Tag v${VERSION} already exists."
else
  git tag -a "v${VERSION}" -m "v${VERSION}"
  echo "Created tag v${VERSION}."
fi

echo "--- git push ---"
git push origin main
git push origin "v${VERSION}"

echo "--- npm publish ---"
npm publish

echo "--- MCP Registry ---"

mcp-publisher login github
mcp-publisher publish

echo "--- docker tag & push ---"
docker tag mcp-comfy-ui-builder:latest "siniidrozd/mcp-comfy-ui-builder:${VERSION}"
docker push "siniidrozd/mcp-comfy-ui-builder:${VERSION}"
docker push siniidrozd/mcp-comfy-ui-builder:latest

echo "--- update package localy ---"
npm install -g mcp-comfy-ui-builder@latest

echo "Done. Published version $VERSION (git, npm, docker)."
