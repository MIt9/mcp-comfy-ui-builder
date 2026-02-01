# Project Insights: mcp-comfy-ui-builder

> Технічний аналіз проекту та рекомендації (згенеровано Claude Opus 4.5)

---

## Загальна оцінка

**mcp-comfy-ui-builder** — добре спроектований MCP-сервер для інтеграції ComfyUI з AI-асистентами. Проект демонструє зрілий підхід до архітектури та документації.

**Оцінка за категоріями:**
| Категорія | Оцінка | Коментар |
|-----------|--------|----------|
| Архітектура | ★★★★☆ | Модульна, чіткий поділ відповідальностей |
| Типізація | ★★★★★ | Strict TypeScript, Zod валідація |
| Тестування | ★★★★☆ | Покриті основні сценарії, є місце для інтеграційних тестів |
| Документація | ★★★★★ | Вичерпна, task-based навігація |
| Error Handling | ★★★★☆ | Retry, graceful degradation |
| DX (Developer Experience) | ★★★★☆ | Зрозумілі команди, postbuild hooks |

---

## Архітектурні інсайти

### Що зроблено добре

1. **Offline-first підхід**
   - Knowledge base працює без ComfyUI
   - Seed-файли — відтворюваність без зовнішніх залежностей
   - Discovery tools доступні завжди

2. **Чітка модульність**
   ```
   src/
   ├── cli.ts              # Entry point, команди
   ├── mcp-server.ts       # MCP протокол (12 tools)
   ├── comfyui-client.ts   # HTTP API абстракція
   ├── workflow/           # Бізнес-логіка workflows
   └── node-discovery/     # Синхронізація knowledge base
   ```

3. **Продумана типізація**
   - `ComfyUIWorkflow` — повний опис структури workflow
   - `NodeDescription` — metadata нод
   - `HistoryEntry`, `QueueStatus` — API responses

4. **Надійність мережі**
   - Exponential backoff у `scanner.ts` та `comfyui-client.ts`
   - Таймаути (60s default)
   - Graceful "ComfyUI not configured" замість crashes

### Потенційні покращення

1. **In-memory cache для knowledge base**
   ```typescript
   // Зараз: завантажується при кожному запиті
   const baseNodes = JSON.parse(await fs.readFile(...));

   // Краще: singleton з TTL
   class KnowledgeCache {
     private cache: Map<string, { data: any; expires: number }>;
     async get(key: string): Promise<any> { ... }
   }
   ```

2. **Валідація workflows перед execute**
   - `node-compatibility.json` вже має producers/consumers
   - Можна перевіряти зв'язки `[nodeId, outputIndex]` → input type

3. **Більше шаблонів**
   - Наразі лише `txt2img`
   - Логічні наступні: `img2img`, `inpainting`, `upscale`, `controlnet`

4. **WebSocket для real-time статусу**
   - Зараз: polling через `get_execution_status`
   - ComfyUI підтримує WS на `/ws`

---

## Код: що варто знати

### Точки входу

| Файл | Призначення | Коли редагувати |
|------|-------------|-----------------|
| `src/cli.ts:1` | CLI команди | Додати нову команду |
| `src/mcp-server.ts:1` | MCP tools | Додати/змінити tool |
| `src/workflow/workflow-builder.ts:1` | Шаблони | Новий template |
| `src/comfyui-client.ts:1` | HTTP клієнт | Новий endpoint |

### Патерн: Retry з backoff

```typescript
// scanner.ts:15-30
for (let attempt = 1; attempt <= maxRetries; attempt++) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000)
    });
    if (response.ok) return await response.json();
  } catch (error) {
    if (attempt === maxRetries) throw error;
    await sleep(1000 * Math.pow(2, attempt - 1));
  }
}
```

### Патерн: MCP tool registration

```typescript
// mcp-server.ts
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'list_node_types':
      return handleListNodeTypes(args);
    case 'build_workflow':
      return handleBuildWorkflow(args);
    // ...
  }
});
```

---

## Тестування

**Поточний стан:**
- 6 test files у `tests/`
- Vitest з watch mode
- Unit tests, мокається fetch

**Що можна додати:**
1. **Integration tests** — запуск MCP server + mock ComfyUI
2. **Snapshot tests** — для workflow JSON output
3. **Property-based tests** — для workflow builder params

**Команди:**
```bash
npm test              # Одноразовий запуск
npm run test:watch    # Watch mode
```

---

## Knowledge Base — структура

```
knowledge/
├── base-nodes.json           # 200+ нод, ~29KB
│   └── { "nodes": { "KSampler": {...}, ... } }
├── node-compatibility.json   # Type graph, ~6KB
│   └── { "types": { "LATENT": { producers: [...], consumers: [...] } } }
├── custom-nodes.json         # ComfyUI-Manager packs
├── seed-base-nodes.json      # Immutable seed
└── seed-node-compatibility.json
```

**Оновлення:**
```bash
npm run sync-manager  # Оновити custom-nodes.json з GitHub
npm run seed          # Перезаписати з seed-файлів
```

---

## Рекомендації для розвитку

### Короткострокові (low effort, high value)

1. **Додати img2img шаблон** — найбільш затребуваний
2. **Cache knowledge base** — простий Map з TTL
3. **Валідація node connections** — перед execute

### Середньострокові

4. **WebSocket support** — real-time execution status
5. **Batch operations** — генерація варіацій
6. **ControlNet шаблон** — популярний use case

### Довгострокові

7. **Web UI** — візуальний редактор workflows
8. **Plugin system** — користувацькі шаблони
9. **Docker image** — простий деплой

---

## Потенційні проблеми

1. **Великі workflows** — JSON може бути значним, немає стримінгу
2. **Версіонування knowledge** — при зміні ComfyUI API
3. **Паралельні запити** — немає rate limiting для ComfyUI

---

## Корисні посилання

- **MCP Spec**: https://modelcontextprotocol.io
- **ComfyUI API**: `doc/comfyui-api-quick-reference.md`
- **Workflow format**: `doc/workflow-builder.md`
- **GitHub**: https://github.com/MIt9/mcp-comfy-ui-builder

---

*Документ згенеровано: 2026-02-01*
