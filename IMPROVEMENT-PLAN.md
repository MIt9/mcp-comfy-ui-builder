# MCP ComfyUI Builder - План покращень

Детальний план покращень для максимальної зручності створення зображень.

---

## Поточний стан проекту

| Компонент | Поточно | Ціль |
|-----------|---------|------|
| MCP інструменти | 18 | 35+ |
| Шаблони workflows | 3 | 10+ |
| Ноди в knowledge base | 31 | 100+ |
| Виконання | Polling | WebSocket + Polling |
| Будування workflows | Тільки шаблони | Шаблони + Dynamic API |

---

## Фаза 1: Розширення шаблонів

### 1.1 Inpainting Template

**Призначення:** Редагування частини зображення по масці.

**Граф нод:**
```
LoadImage (image)
    ↓
LoadImageMask (mask) → SetLatentNoiseMask
    ↓                      ↓
VAEEncode ←────────────────┘
    ↓
CheckpointLoaderSimple → CLIPTextEncode (positive)
    ↓                  → CLIPTextEncode (negative)
    ↓                      ↓
KSampler ←─────────────────┘
    ↓
VAEDecode
    ↓
SaveImage
```

**Параметри:**
| Параметр | Тип | Default | Опис |
|----------|-----|---------|------|
| image | string | required | Вхідне зображення |
| mask | string | required | Маска (біле = область редагування) |
| prompt | string | required | Текстовий промпт |
| negative_prompt | string | "" | Негативний промпт |
| steps | number | 20 | Кількість кроків |
| cfg | number | 7.0 | CFG scale |
| seed | number | random | Seed |
| denoise | number | 0.85 | Сила редагування |
| ckpt_name | string | auto | Модель checkpoint |

**Файли для зміни:**
- `src/workflow/workflow-builder.ts` - додати `buildInpainting()`
- `knowledge/base-nodes.json` - додати `LoadImageMask`, `SetLatentNoiseMask`
- `tests/workflow-builder.test.ts` - тести

---

### 1.2 Upscaling Template

**Призначення:** Збільшення роздільної здатності зображення.

**Варіант A - Простий upscale:**
```
LoadImage → UpscaleModelLoader → ImageUpscaleWithModel → SaveImage
```

**Варіант B - Upscale + Refinement:**
```
LoadImage → UpscaleModelLoader → ImageUpscaleWithModel
                                        ↓
                                   VAEEncode
                                        ↓
CheckpointLoaderSimple → CLIPTextEncode → KSampler (denoise=0.3)
                                               ↓
                                          VAEDecode
                                               ↓
                                          SaveImage
```

**Параметри:**
| Параметр | Тип | Default | Опис |
|----------|-----|---------|------|
| image | string | required | Вхідне зображення |
| upscale_model | string | "RealESRGAN_x4plus.pth" | Модель upscale |
| scale | number | 4 | Множник (2x, 4x) |
| refine | boolean | false | Чи робити refinement |
| denoise | number | 0.3 | Сила refinement |
| prompt | string | "" | Промпт для refinement |

**Файли для зміни:**
- `src/workflow/workflow-builder.ts` - додати `buildUpscale()`
- `knowledge/base-nodes.json` - додати `UpscaleModelLoader`, `ImageUpscaleWithModel`

---

### 1.3 LoRA Template

**Призначення:** Text-to-image з LoRA моделями.

**Граф нод:**
```
CheckpointLoaderSimple
        ↓
LoraLoader (може бути декілька в ланцюжку)
        ↓
CLIPTextEncode (positive) ←───┐
CLIPTextEncode (negative) ←───┤
        ↓                     │
EmptyLatentImage              │
        ↓                     │
KSampler ←────────────────────┘
        ↓
VAEDecode
        ↓
SaveImage
```

**Параметри:**
| Параметр | Тип | Default | Опис |
|----------|-----|---------|------|
| prompt | string | required | Промпт |
| negative_prompt | string | "" | Негативний промпт |
| loras | array | required | Масив LoRA: `[{name, strength_model, strength_clip}]` |
| width | number | 1024 | Ширина |
| height | number | 1024 | Висота |
| steps | number | 20 | Кроки |
| cfg | number | 7.0 | CFG |
| seed | number | random | Seed |
| ckpt_name | string | auto | Checkpoint |

**Приклад використання:**
```json
{
  "template": "txt2img_lora",
  "params": {
    "prompt": "a beautiful landscape",
    "loras": [
      {"name": "detailed_v2.safetensors", "strength_model": 0.8, "strength_clip": 0.8},
      {"name": "more_details.safetensors", "strength_model": 0.5, "strength_clip": 0.5}
    ]
  }
}
```

---

### 1.4 ControlNet Template

**Призначення:** Генерація з контролем структури через ControlNet.

**Граф нод:**
```
LoadImage (control_image)
        ↓
ControlNetLoader → ControlNetApply
        ↓               ↓
        └───────────────┘
                ↓
CheckpointLoaderSimple → CLIPTextEncode (positive)
                       → CLIPTextEncode (negative)
                              ↓
EmptyLatentImage              │
        ↓                     │
KSampler ←────────────────────┘
        ↓
VAEDecode
        ↓
SaveImage
```

**Параметри:**
| Параметр | Тип | Default | Опис |
|----------|-----|---------|------|
| control_image | string | required | Контрольне зображення |
| controlnet_name | string | required | Модель ControlNet |
| strength | number | 1.0 | Сила впливу (0.0-2.0) |
| prompt | string | required | Промпт |
| negative_prompt | string | "" | Негативний промпт |
| width | number | 1024 | Ширина |
| height | number | 1024 | Висота |
| steps | number | 20 | Кроки |
| cfg | number | 7.0 | CFG |

**Варіанти (preprocessors):**
- `controlnet_canny` - контроль по контурах
- `controlnet_depth` - контроль по глибині
- `controlnet_pose` - контроль по позі

---

### 1.5 Batch Processing Template

**Призначення:** Генерація серії зображень з варіаціями.

**Параметри:**
| Параметр | Тип | Default | Опис |
|----------|-----|---------|------|
| base_params | object | required | Базові параметри txt2img |
| variations | array | required | Масив варіацій seed/prompt |
| batch_size | number | 1 | Кількість в одному batch |

---

## Фаза 2: Dynamic Workflow Builder

### 2.1 Архітектура

**Новий файл:** `src/workflow/dynamic-builder.ts`

```typescript
// Контекст workflow в пам'яті
interface WorkflowContext {
  id: string;
  workflow: ComfyUIWorkflow;
  nodeCounter: number;
  createdAt: Date;
}

// Публічний API
export function createWorkflow(): WorkflowContext;
export function addNode(ctx: WorkflowContext, classType: string, inputs?: Record<string, unknown>): string;
export function connectNodes(ctx: WorkflowContext, fromNodeId: string, outputIndex: number, toNodeId: string, inputName: string): void;
export function removeNode(ctx: WorkflowContext, nodeId: string): void;
export function setNodeInput(ctx: WorkflowContext, nodeId: string, inputName: string, value: unknown): void;
export function getWorkflow(ctx: WorkflowContext): ComfyUIWorkflow;
export function validateWorkflow(ctx: WorkflowContext): ValidationResult;
```

**Новий файл:** `src/workflow/workflow-store.ts`

```typescript
// In-memory сховище з TTL
class WorkflowStore {
  private contexts: Map<string, WorkflowContext>;
  private readonly ttl: number = 30 * 60 * 1000; // 30 хвилин

  create(): string;
  get(id: string): WorkflowContext | null;
  update(id: string, ctx: WorkflowContext): void;
  delete(id: string): void;
  cleanup(): void; // Видалити старі контексти
}
```

### 2.2 Нові MCP інструменти

| Інструмент | Вхід | Вихід | Опис |
|------------|------|-------|------|
| `create_workflow` | - | workflow_id | Створити порожній workflow |
| `add_node` | workflow_id, class_type, inputs? | node_id | Додати ноду |
| `connect_nodes` | workflow_id, from_node, output_idx, to_node, input_name | success | З'єднати ноди |
| `remove_node` | workflow_id, node_id | success | Видалити ноду |
| `set_node_input` | workflow_id, node_id, input_name, value | success | Встановити вхід |
| `get_workflow_json` | workflow_id | workflow JSON | Отримати поточний JSON |
| `validate_workflow` | workflow_id | validation result | Перевірити валідність |
| `finalize_workflow` | workflow_id | workflow JSON | Завершити і отримати JSON |

### 2.3 Приклад використання

```
1. create_workflow() → "wf_abc123"
2. add_node("wf_abc123", "CheckpointLoaderSimple") → "1"
3. add_node("wf_abc123", "CLIPTextEncode", {text: "a cat"}) → "2"
4. connect_nodes("wf_abc123", "1", 1, "2", "clip")
5. add_node("wf_abc123", "EmptyLatentImage", {width: 512, height: 512}) → "3"
6. add_node("wf_abc123", "KSampler") → "4"
7. connect_nodes("wf_abc123", "1", 0, "4", "model")
8. connect_nodes("wf_abc123", "2", 0, "4", "positive")
9. connect_nodes("wf_abc123", "3", 0, "4", "latent_image")
10. validate_workflow("wf_abc123") → {valid: true}
11. get_workflow_json("wf_abc123") → {...}
12. execute_workflow({...})
```

---

## Фаза 3: Node Discovery Enhancement

### 3.1 Live Discovery з ComfyUI

**Зміни в:** `src/comfyui-client.ts`

```typescript
interface ObjectInfoNode {
  input: {
    required?: Record<string, [string, unknown]>;
    optional?: Record<string, [string, unknown]>;
  };
  output: string[];
  output_name: string[];
  category: string;
  description?: string;
}

async function getObjectInfo(): Promise<Record<string, ObjectInfoNode>>;
```

### 3.2 Hybrid Discovery

**Новий файл:** `src/node-discovery/hybrid-discovery.ts`

```typescript
class HybridNodeDiscovery {
  private cache: Map<string, ObjectInfoNode>;
  private cacheExpiry: number = 5 * 60 * 1000; // 5 хвилин

  // Отримати з live ComfyUI, fallback на knowledge base
  async getNode(name: string): Promise<NodeInfo>;

  // Пошук по всіх джерелах
  async searchNodes(query: string, filters?: NodeFilters): Promise<NodeInfo[]>;

  // Синхронізувати live → knowledge base
  async syncToKnowledgeBase(): Promise<SyncResult>;
}
```

### 3.3 Нові MCP інструменти

| Інструмент | Опис |
|------------|------|
| `discover_nodes_live` | Отримати всі ноди з працюючого ComfyUI |
| `search_nodes` | Пошук по name, category, input/output types |
| `get_node_inputs` | Детальна інфо про входи ноди |
| `get_node_outputs` | Детальна інфо про виходи ноди |
| `list_node_categories` | Список всіх категорій |
| `sync_nodes_to_knowledge` | Синхронізувати live → knowledge base |

---

## Фаза 4: Execution Improvements

### 4.1 WebSocket Client

**Новий файл:** `src/comfyui-ws-client.ts`

```typescript
interface ExecutionProgress {
  prompt_id: string;
  status: 'queued' | 'started' | 'executing' | 'completed' | 'error';
  current_node?: string;
  current_node_progress?: number;
  queue_position?: number;
  outputs?: Record<string, unknown>;
  error?: string;
}

class ComfyUIWebSocket {
  constructor(host: string);

  connect(clientId: string): Promise<void>;
  disconnect(): void;

  // Callbacks
  onProgress(callback: (progress: ExecutionProgress) => void): void;
  onNodeStart(callback: (nodeId: string, nodeType: string) => void): void;
  onNodeComplete(callback: (nodeId: string, output: unknown) => void): void;
  onError(callback: (error: Error) => void): void;

  // Синхронне виконання з очікуванням
  submitAndWait(workflow: ComfyUIWorkflow, timeout?: number): Promise<ExecutionResult>;
}
```

### 4.2 Batch Executor

**Новий файл:** `src/workflow/batch-executor.ts`

```typescript
interface BatchConfig {
  workflows: ComfyUIWorkflow[];
  concurrency: number;
  stopOnError: boolean;
  onProgress?: (index: number, total: number, progress: ExecutionProgress) => void;
}

interface BatchResult {
  index: number;
  prompt_id: string;
  status: 'completed' | 'failed';
  outputs?: Record<string, unknown>;
  error?: string;
}

async function executeBatch(config: BatchConfig): Promise<BatchResult[]>;
```

### 4.3 Output Manager

**Новий файл:** `src/output-manager.ts`

```typescript
interface OutputFile {
  prompt_id: string;
  node_id: string;
  type: 'image' | 'text' | 'audio' | 'video';
  filename: string;
  subfolder: string;
  url: string;
}

class OutputManager {
  async listOutputs(prompt_id: string): Promise<OutputFile[]>;
  async downloadOutput(file: OutputFile, destPath: string): Promise<string>;
  async downloadAllOutputs(prompt_id: string, destDir: string): Promise<string[]>;
  async deleteOutputs(prompt_id: string): Promise<void>;
}
```

### 4.4 Нові/покращені MCP інструменти

| Інструмент | Опис |
|------------|------|
| `execute_workflow_sync` | Виконати і дочекатись результату |
| `get_execution_progress` | Real-time progress (WebSocket) |
| `execute_batch` | Виконати декілька workflows |
| `list_outputs` | Список файлів результату |
| `download_output` | Завантажити файл |
| `download_all_outputs` | Завантажити всі файли |

---

## Фаза 5: Model Management

### 5.1 Model Manager

**Новий файл:** `src/model-manager.ts`

```typescript
type ModelType = 'checkpoint' | 'lora' | 'vae' | 'controlnet' | 'upscale' | 'embedding' | 'clip';

interface ModelInfo {
  name: string;
  type: ModelType;
  path: string;
  size?: number;
  hash?: string;
  metadata?: Record<string, unknown>;
}

class ModelManager {
  constructor(comfyPath: string);

  // Discovery
  async listModels(type?: ModelType): Promise<ModelInfo[]>;
  async getModelInfo(name: string, type: ModelType): Promise<ModelInfo | null>;
  async checkModelExists(name: string, type: ModelType): Promise<boolean>;

  // Workflow analysis
  async getRequiredModels(workflow: ComfyUIWorkflow): Promise<ModelRequirement[]>;
  async checkWorkflowModels(workflow: ComfyUIWorkflow): Promise<ModelCheckResult>;
}
```

### 5.2 Нові MCP інструменти

| Інструмент | Опис |
|------------|------|
| `list_models` | Список моделей по типу |
| `get_model_info` | Деталі моделі |
| `check_model_exists` | Перевірка наявності |
| `get_workflow_models` | Які моделі потрібні для workflow |
| `check_workflow_models` | Перевірка наявності всіх моделей |

---

## Фаза 6: Workflow Composition

### 6.1 Parameterized Templates

**Новий файл:** `src/workflow/workflow-template.ts`

```typescript
interface ParameterDefinition {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'array';
  required: boolean;
  default?: unknown;
  options?: unknown[]; // для select
  description?: string;
  nodeBindings: Array<{nodeId: string; inputName: string}>;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: ParameterDefinition[];
  workflow: ComfyUIWorkflow;
}

function createTemplate(workflow: ComfyUIWorkflow, params: ParameterDefinition[]): WorkflowTemplate;
function applyTemplate(template: WorkflowTemplate, values: Record<string, unknown>): ComfyUIWorkflow;
function validateTemplateParams(template: WorkflowTemplate, values: Record<string, unknown>): ValidationResult;
```

### 6.2 Macros (Sub-workflows)

**Новий файл:** `src/workflow/macro.ts`

```typescript
interface MacroPort {
  name: string;
  type: string;
  nodeId: string;
  portIndex: number;
}

interface Macro {
  id: string;
  name: string;
  description: string;
  inputs: MacroPort[];
  outputs: MacroPort[];
  nodes: ComfyUIWorkflow;
}

// Вбудовані макроси
const BUILTIN_MACROS = {
  'upscale_refine': {...},    // Upscale + KSampler refinement
  'face_detail': {...},        // Face detection + inpainting
  'controlnet_canny': {...},   // Canny preprocessor + ControlNet
};

function insertMacro(ctx: WorkflowContext, macro: Macro, inputConnections: Record<string, [string, number]>): MacroInsertResult;
function createMacroFromSelection(workflow: ComfyUIWorkflow, nodeIds: string[]): Macro;
```

### 6.3 Workflow Chaining

**Новий файл:** `src/workflow/chainer.ts`

```typescript
interface ChainStep {
  workflow: ComfyUIWorkflow | string; // JSON або назва збереженого
  params?: Record<string, unknown>;
  inputFrom?: {
    step: number;
    outputNode: string;
    outputIndex: number;
  };
  outputTo?: string; // input name для наступного кроку
}

interface ChainResult {
  stepIndex: number;
  prompt_id: string;
  status: 'completed' | 'failed';
  outputs: Record<string, unknown>;
}

async function executeChain(steps: ChainStep[]): Promise<ChainResult[]>;
```

**Приклад ланцюжка:**
```
Step 1: txt2img → генерує зображення
Step 2: upscale (input = output step 1) → збільшує
Step 3: img2img (input = output step 2, denoise=0.3) → покращує деталі
```

### 6.4 Нові MCP інструменти

| Інструмент | Опис |
|------------|------|
| `create_template` | Створити template з workflow |
| `list_templates` | (розширити) Список з параметрами |
| `apply_template` | Застосувати template з параметрами |
| `list_macros` | Список доступних макросів |
| `insert_macro` | Вставити макрос в workflow |
| `execute_chain` | Виконати ланцюжок workflows |

---

## Зведена таблиця змін

### Файли для модифікації

| Файл | Фази | Зміни |
|------|------|-------|
| `src/workflow/workflow-builder.ts` | 1 | +4 templates |
| `src/mcp-server.ts` | 1-6 | +20 tools |
| `src/comfyui-client.ts` | 3, 4 | +getObjectInfo, WebSocket |
| `knowledge/base-nodes.json` | 1, 3 | +ноди |
| `src/types/node-types.ts` | 2, 3 | +типи |

### Нові файли

| Файл | Фаза | Призначення |
|------|------|-------------|
| `src/workflow/dynamic-builder.ts` | 2 | Dynamic API |
| `src/workflow/workflow-store.ts` | 2 | In-memory store |
| `src/node-discovery/hybrid-discovery.ts` | 3 | Merged discovery |
| `src/comfyui-ws-client.ts` | 4 | WebSocket client |
| `src/workflow/batch-executor.ts` | 4 | Batch execution |
| `src/output-manager.ts` | 4 | Output files |
| `src/model-manager.ts` | 5 | Model discovery |
| `src/workflow/workflow-template.ts` | 6 | Templates |
| `src/workflow/macro.ts` | 6 | Macros |
| `src/workflow/chainer.ts` | 6 | Chaining |

---

## Залежності та порядок

```
Фаза 1 ──────────────────────► Незалежна, починати першою
    │
    ▼
Фаза 2 ──────────────────────► Використовує ноди з Фази 1
    │
    ├────► Фаза 3 ───────────► Паралельно з Фазою 2
    │
    ▼
Фаза 4 ──────────────────────► Після Фази 2 (batch потребує workflows)
    │
    ├────► Фаза 5 ───────────► Паралельно з Фазою 4
    │
    ▼
Фаза 6 ──────────────────────► Після Фаз 2, 4, 5
```

---

## Тестування та верифікація

### Unit тести (кожна фаза)
```bash
npm test
```

### Integration тести
```bash
# Запустити ComfyUI
# Запустити MCP сервер
npm run mcp

# Тестові сценарії в Claude/Cursor:
# 1. build_workflow("inpainting", {...}) → execute
# 2. create_workflow → add_node → connect → execute
# 3. discover_nodes_live → search_nodes
# 4. execute_workflow_sync → list_outputs
# 5. list_models → check_workflow_models
# 6. execute_chain
```

### Чекліст для кожної фази

- [ ] Код компілюється без помилок
- [ ] Unit тести проходять
- [ ] MCP сервер стартує
- [ ] Нові tools доступні в Claude/Cursor
- [ ] Workflow виконується в ComfyUI
- [ ] Документація оновлена
