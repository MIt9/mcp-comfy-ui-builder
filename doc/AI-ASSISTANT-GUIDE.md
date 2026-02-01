# Гайд для ШІ: як працювати з mcp-comfy-ui-builder

> Короткий опис для AI-асистента: що це, як підключити, які інструменти викликати і в якому порядку.

---

## Що це

**mcp-comfy-ui-builder** — MCP-сервер для ComfyUI: дозволяє дізнаватися про ноди, збирати workflow (txt2img), зберігати/завантажувати їх і запускати на ComfyUI. Користувач міг встановити пакет глобально: `npm i -g mcp-comfy-ui-builder`.

---

## Як підключити MCP у Cursor (після глобального встановлення)

1. Дізнайся шлях до MCP-сервера:
   ```bash
   node -e "console.log(require('path').join(require('path').dirname(require.resolve('mcp-comfy-ui-builder/package.json')), 'dist', 'mcp-server.js'))"
   ```
   Або якщо знаєш глобальний `node_modules`: `$(npm root -g)/mcp-comfy-ui-builder/dist/mcp-server.js`

2. У Cursor: **Settings → MCP** (або конфіг MCP). Додай сервер:
   ```json
   {
     "mcpServers": {
       "comfy-ui-builder": {
         "command": "node",
         "args": ["/ШЛЯХ_ДО/mcp-comfy-ui-builder/dist/mcp-server.js"]
       }
     }
   }
   ```
   Замість `/ШЛЯХ_ДО/` — повний шлях з кроку 1 (наприклад на macOS: `/usr/local/lib/node_modules/mcp-comfy-ui-builder/dist/mcp-server.js`).

3. Перезапусти Cursor. Після цього будуть доступні інструменти нижче.

---

## Інструменти (що викликати)

| Інструмент | Коли використовувати | ComfyUI потрібен? |
|------------|----------------------|--------------------|
| **list_templates** | Показати доступні шаблони (txt2img, img2img) | Ні |
| **list_node_types** | Список нод з бази знань (опційно: category, priority) | Ні |
| **get_node_info** | Повна інформація про ноду за class name | Ні |
| **check_compatibility** | Чи можна з’єднати вихід однієї ноди з входом іншої | Ні |
| **suggest_nodes** | Підбір нод за описом задачі або типом (task_description / input_type) | Ні |
| **build_workflow** | Зібрати workflow JSON з шаблону (наприклад txt2img) + params (width, height, steps, cfg, prompt, negative_prompt, seed тощо) | Ні |
| **save_workflow** | Зберегти workflow у файл workflows/<name>.json | Ні |
| **list_saved_workflows** | Список збережених workflow (імена та шляхи) | Ні |
| **load_workflow** | Завантажити workflow за ім’ям або шляхом; результат — JSON для execute_workflow | Ні |
| **execute_workflow** | Відправити workflow на ComfyUI; повертає prompt_id | Так (COMFYUI_HOST) |
| **get_execution_status** | Статус виконання за prompt_id, виходи (зокрема зображення) | Так |
| **list_queue** | Черга: що зараз виконується і що в очікуванні | Так |

Для **execute_workflow**, **get_execution_status**, **list_queue** потрібно, щоб був встановлений **COMFYUI_HOST** (за замовчуванням `http://127.0.0.1:8188`) і щоб ComfyUI був запущений. Решта інструментів працюють без ComfyUI.

---

## Типові сценарії

**Зібрати txt2img і отримати JSON (без запуску ComfyUI):**
1. `list_templates` — переконатися, що є txt2img.
2. `build_workflow` з template `txt2img` і params (наприклад width, height, prompt, steps, seed). Результат — workflow JSON.

**Зберегти і потім завантажити workflow:**
1. Після `build_workflow` — `save_workflow(name, workflow)` (workflow — рядок JSON з результату build_workflow).
2. Пізніше — `list_saved_workflows`, потім `load_workflow(name_or_path)` для отримання JSON.

**Запустити workflow на ComfyUI:**
1. Отримати workflow JSON: або через `build_workflow`, або через `load_workflow`.
2. `execute_workflow(workflow)` — передати **рядок** JSON. Отримаєш prompt_id.
3. `get_execution_status(prompt_id)` — перевірити статус і виходи (зображення, посилання на перегляд).
4. За потреби — `list_queue` для черги.

**Дослідити ноди (без генерації):**
- `list_node_types`, `get_node_info(node_name)`, `check_compatibility(from_node, to_node)`, `suggest_nodes(task_description або input_type)`.

---

## Що повідомити користувачу

- Якщо він каже, що встановив глобально: допомогти знайти шлях до `dist/mcp-server.js` і додати його в MCP у Cursor (як вище).
- Якщо потрібно щось згенерувати в ComfyUI: перевірити, чи він хоче запускати на своєму ComfyUI (тоді потрібен COMFYUI_HOST і запущений ComfyUI); якщо ні — достатньо build_workflow / save / load.
- Параметри txt2img: width, height, steps, cfg, prompt, negative_prompt, seed, ckpt_name, filename_prefix, batch_size, denoise (деталі в doc/workflow-builder.md).
- Параметри img2img: image, steps, cfg, prompt, negative_prompt, seed, ckpt_name, filename_prefix, denoise (0.75 за замовчуванням — менше = більше оригіналу).
