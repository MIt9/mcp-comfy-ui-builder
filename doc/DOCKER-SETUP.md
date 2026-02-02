> Docker setup for mcp-comfy-ui-builder (MCP server + ComfyUI)

---

## Testing

Before deploying, you can verify the Docker setup:

```bash
# Ensure Docker Desktop is running, then:
npm run test:docker
```

Or run the script directly:

```bash
./scripts/test-docker.sh
```

This will: (1) build the MCP server image, (2) verify the container starts, (3) run `docker compose build` for the full stack. CI also runs Docker build on every push (see `.github/workflows/ci.yml`).

---

## Requirements

- Docker
- Docker Compose v2
- Node.js is **not** required inside the container (only on host if you run without Docker).

---

## Option A — MCP-only Docker image

This option runs the MCP server in Docker. You run ComfyUI separately (on host or in another container) and point `COMFYUI_HOST` to it.

### 1. Pull or build the image

**Pull from Docker Hub** (recommended):

```bash
docker pull siniidrozd/mcp-comfy-ui-builder:0.5.0
```

**Or build from source** (from project root):

```bash
docker build -t mcp-comfy-ui-builder:latest .
```

This uses the `Dockerfile` in the repository:

- Stage 1: install dependencies, build TypeScript, run `npm run build` (which also seeds knowledge).
- Stage 2: runtime image with `dist/` and `knowledge/`, entrypoint `node dist/mcp-server.js`.

### 2. Run with a local ComfyUI

If ComfyUI runs directly on your host at `http://127.0.0.1:8188`, you can start the MCP server container like this:

```bash
docker run --rm -i \
  -e COMFYUI_HOST=http://host.docker.internal:8188 \
  siniidrozd/mcp-comfy-ui-builder:0.5.0
```

Notes:

- `host.docker.internal` points back to the host from inside Docker on macOS/Windows. Adjust as needed for Linux or your network setup.
- MCP server communicates over **stdio**; `-i` keeps stdin open for MCP clients (Cursor/Claude).

### 3. Configure in Cursor/Claude via Docker

In MCP config (Cursor or Claude Desktop), you can point the server to `docker` instead of `node`, for example:

```jsonc
{
  "mcpServers": {
    "comfy-ui-builder-docker": {
      "command": "docker",
      "args": [
        "run",
        "--rm",
        "-i",
        "siniidrozd/mcp-comfy-ui-builder:0.5.0"
      ]
    }
  }
}
```

Then set `COMFYUI_HOST` via:

- environment for Docker (e.g. `docker run -e COMFYUI_HOST=...` in the command above), or
- `.env` file baked into the image (advanced, not covered here).

---

## Option B — docker-compose with ComfyUI

This option runs **ComfyUI** and **mcp-comfy-ui-builder** in a single `docker compose` stack with a shared volume for models and outputs.

### 1. Example compose file

Project ships with `docker-compose.example.yml`:

```yaml
version: "3.9"

services:
  comfyui:
    image: ghcr.io/comfyanonymous/comfyui:latest
    container_name: comfyui
    ports:
      - "8188:8188"
    environment:
      - CLI_ARGS=--listen 0.0.0.0
    volumes:
      - comfyui-data:/data

  mcp-comfy-ui-builder:
    build: .
    image: mcp-comfy-ui-builder:local
    container_name: mcp-comfy-ui-builder
    depends_on:
      - comfyui
    environment:
      - NODE_ENV=production
      - COMFYUI_HOST=http://comfyui:8188
      - COMFYUI_PATH=/data
    volumes:
      - comfyui-data:/data

volumes:
  comfyui-data:
    driver: local
```

Key points:

- `COMFYUI_HOST=http://comfyui:8188` — MCP server talks to ComfyUI service by its Docker service name.
- `COMFYUI_PATH=/data` — shared volume for models, custom nodes and outputs (used by install tools).
- `comfyui-data` volume is mounted into both containers at `/data`.

### 2. Start the stack

From project root:

```bash
docker compose -f docker-compose.example.yml up --build
```

This will:

- build the `mcp-comfy-ui-builder` image from the local Dockerfile,
- pull the ComfyUI image,
- start both containers with a shared `/data` volume.

You can then reach ComfyUI UI at:

```text
http://localhost:8188
```

### 3. Use the MCP server container from Cursor/Claude

The MCP server inside Docker still communicates over **stdio**. To use it from Cursor/Claude, configure the MCP server command to run the container, for example:

```jsonc
{
  "mcpServers": {
    "comfy-ui-builder": {
      "command": "docker",
      "args": [
        "compose",
        "-f",
        "/ABSOLUTE/PATH/TO/mcp-comfy-ui-builder/docker-compose.example.yml",
        "run",
        "--rm",
        "-i",
        "mcp-comfy-ui-builder"
      ]
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/mcp-comfy-ui-builder` with your local path.

Notes:

- `docker compose run --rm -i mcp-comfy-ui-builder` will start just the MCP service (using the `comfyui` service in the same compose file).
- Ensure the compose stack is built (`docker compose build`) or running (`docker compose up -d`) as needed.

---

## Environment variables recap

- **`COMFYUI_HOST`** — where the MCP server finds ComfyUI API.
  - Default in Dockerfile: `http://127.0.0.1:8188`.
  - In compose example: `http://comfyui:8188`.
- **`COMFYUI_PATH`** — path to ComfyUI root (for install tools like `install_model`, `install_custom_node`).
  - In compose example: `/data` (shared volume).
- **`NODE_ENV`** — set to `production` in the runtime container.

For full list of MCP tools and when `COMFYUI_HOST` / `COMFYUI_PATH` are required, see [MCP-SETUP.md](MCP-SETUP.md).

