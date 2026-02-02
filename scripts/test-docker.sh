#!/usr/bin/env bash
# Docker testing script for mcp-comfy-ui-builder
# Run from project root: ./scripts/test-docker.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo "=== Docker Testing ==="

# Check Docker is available
if ! command -v docker &>/dev/null; then
  echo "ERROR: docker is not installed or not in PATH"
  exit 1
fi

if ! docker info &>/dev/null; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop and try again."
  exit 1
fi

# 1. Build MCP server image
echo ""
echo "1. Building mcp-comfy-ui-builder image..."
docker build -t mcp-comfy-ui-builder:latest .
echo "   ✓ Build successful"

# 2. Verify container starts (MCP server uses stdio, waits for input)
echo ""
echo "2. Verifying container starts..."
set +e
timeout 3 docker run --rm -i mcp-comfy-ui-builder:latest </dev/null 2>/dev/null
EXIT=$?
set -e
if [ "$EXIT" -eq 0 ] || [ "$EXIT" -eq 124 ]; then
  echo "   ✓ Container runs successfully"
else
  echo "   ✗ Container failed (exit $EXIT)"
  exit 1
fi

# 3. docker-compose build (build mcp-comfy-ui-builder service only)
echo ""
echo "3. Testing docker-compose build..."
docker compose -f docker-compose.example.yml build mcp-comfy-ui-builder 2>/dev/null || \
  docker-compose -f docker-compose.example.yml build mcp-comfy-ui-builder 2>/dev/null
echo "   ✓ docker-compose build successful"

echo ""
echo "=== All Docker tests passed ==="
