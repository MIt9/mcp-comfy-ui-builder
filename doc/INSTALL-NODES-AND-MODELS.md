# Install Custom Nodes and Models via MCP

> Встановлення кастомних нод, чекпоінтів, LoRA та інших моделей через MCP без участі розробника.

***

## Умови

- **COMFYUI_PATH** — шлях до каталогу ComfyUI на диску (наприклад `/home/user/ComfyUI` або `C:\ComfyUI`). MCP сервер запускається на тій же машині, де вказаний цей шлях.
- Для **кастомних нод**: у ComfyUI має бути встановлений **ComfyUI-Manager** (у `custom_nodes/ComfyUI-Manager`), і там має бути файл `cm-cli.py`.
- Для **моделей**: завантаження працює завжди (fetch по URL). Якщо встановлено **comfy-cli** (`pip install comfy-cli`), використовується він для завантаження моделей.

***

## Інструменти MCP

### install_custom_node

Встановлює один або кілька пакетів кастомних нод через ComfyUI-Manager (cm-cli).

| Параметр    | Опис |
|-------------|------|
| node_names  | Масив назв пакетів, як у ComfyUI-Manager (наприклад `ComfyUI-Blip`, `ComfyUI-Impact-Pack`, `WAS-Node-Suite`). |
| channel     | Опційно: канал (див. документацію cm-cli). |
| mode        | Опційно: `remote`, `local` або `cache`. |

**Приклад:** встановити ComfyUI-Blip та WAS-Node-Suite:
- `install_custom_node({ "node_names": ["ComfyUI-Blip", "WAS-Node-Suite"] })`

Після встановлення потрібно **перезапустити ComfyUI**, щоб нові ноди підхопились.

---

### install_model

Завантажує модель (чекпоінт, LoRA, VAE тощо) за прямим URL і зберігає у відповідну папку ComfyUI.

| Параметр   | Опис |
|------------|------|
| url        | Пряме посилання на завантаження (Civitai, HuggingFace тощо). |
| model_type | Тип моделі (за замовчуванням `checkpoint`). Див. нижче. |

**Типи моделей (model_type):**

| model_type     | Папка в ComfyUI        |
|----------------|------------------------|
| checkpoint     | models/checkpoints     |
| lora          | models/loras           |
| vae           | models/vae             |
| controlnet    | models/controlnet      |
| clip          | models/clip            |
| embeddings    | embeddings             |
| hypernetwork  | models/hypernetworks   |
| upscale_models| models/upscale_models   |
| clip_vision   | models/clip_vision     |
| unet          | models/unet            |
| diffusers     | models/diffusers       |

**Приклади:**
- Чекпоінт: `install_model({ "url": "https://.../model.safetensors", "model_type": "checkpoint" })`
- LoRA: `install_model({ "url": "https://civitai.com/.../download", "model_type": "lora" })`
- VAE: `install_model({ "url": "https://.../vae.safetensors", "model_type": "vae" })`

Якщо в PATH є **comfy-cli**, використовується він; інакше файл завантажується напряму (fetch) у `COMFYUI_PATH/models/<type>/`.

***

## Налаштування COMFYUI_PATH

У конфігурації MCP сервера (Cursor, Claude Desktop) додайте змінну середовища:

**Cursor** — у блоці сервера:
```json
{
  "mcpServers": {
    "comfy-ui-builder": {
      "command": "node",
      "args": ["/path/to/mcp-comfy-ui-builder/dist/mcp-server.js"],
      "env": {
        "COMFYUI_PATH": "/path/to/ComfyUI"
      }
    }
  }
}
```

**Claude Desktop** — у файлі конфігурації MCP додайте `env` з `COMFYUI_PATH` для відповідного сервера.

На Windows використовуйте повний шлях, наприклад `C:\\Users\\Name\\ComfyUI`.

***

## Підсумок

| Дія              | Інструмент             | COMFYUI_PATH | Інше |
|------------------|------------------------|--------------|------|
| Встановити ноди  | install_custom_node    | Так          | ComfyUI-Manager у custom_nodes |
| Завантажити модель / LoRA | install_model | Так          | Опційно: comfy-cli у PATH |

Після встановлення нод — перезапустіть ComfyUI. Моделі з’являться у відповідних папках і в UI після оновлення списків (або перезапуску).
