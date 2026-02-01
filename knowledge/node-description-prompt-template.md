# Node Description Prompt Template (Claude)

> Template for generating structured JSON description of ComfyUI node via Claude

***

## Instructions

1. Get RAW info about the node from ComfyUI:
   ```bash
   curl http://127.0.0.1:8188/object_info | jq '.NodeClassName' > node.json
   ```

2. Below is the prompt. Replace `{{RAW_NODE_JSON}}` with the content from node.json (or paste it in chat separately).

3. Ask Claude to return **only valid JSON** without markdown code blocks at the beginning/end (or with one block ` ```json ... ``` `).

4. Copy the result to `knowledge/base-nodes.json` → `nodes` object → key `NodeClassName`.

***

## Prompt (template)

```
You are an expert on ComfyUI. Provide a structured node description in JSON format.

**Raw node output from ComfyUI /object_info:**

{{RAW_NODE_JSON}}

**JSON Requirements:**

- display_name: human-readable name
- category: one of loaders, conditioning, sampling, latent, image, mask or appropriate
- description: 1-2 sentences describing what the node does
- input_types.required: for each parameter from input.required — type, description, color (hex for MODEL/CLIP/LATENT/IMAGE/CONDITIONING/VAE/MASK), default/min/max/notes where available
- return_types, return_names, output_colors: from output/output_name; colors for types as in the table (MODEL #B22222, CLIP #FFD700, CONDITIONING #FFA931, LATENT #FF6E6E, IMAGE #64B5F6, MASK #81C784)
- use_cases: array of 3-5 short usage scenarios
- compatible_outputs: for each return type — array of node names to which the output can be connected
- example_values: example values for key parameters
- priority: "high" | "medium" | "low"

Return only one JSON object, without explanations.
```

***

## Type Color Table (for prompt substitution)

| Type          | Hex     |
|-------------|---------|
| MODEL       | #B22222 |
| CLIP        | #FFD700 |
| VAE         | #FF6E6E |
| CONDITIONING| #FFA931 |
| LATENT      | #FF6E6E |
| IMAGE       | #64B5F6 |
| MASK        | #81C784 |

***

*Template v1.0* | *2026-02-01*
