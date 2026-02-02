# Changelog – Knowledge Base

Change history for ComfyUI node knowledge base. Updated on `npm run seed` or manual addition.

---

## [1.2.1] – 2026-02-02

### Added

- **WAS-Node-Suite** full definitions: WAS_Image_Blend, WAS_Text_Parse_Tokens, WAS_Image_Resize, WAS_Image_Mask_Blend
- **KJNodes** full definitions: KJNodes_ImageBlend, KJNodes_SetNode, KJNodes_GetNode

---

## [1.2.0] – 2026-02-02 (Phase 9: Knowledge Base Expansion)

### Added

- **24 new nodes** in seed-base-nodes.json (31 → 55 total):
  - Base ComfyUI: FlipImage, CLIPVisionEncode, ClipVisionLoader, CLIPSetLastLayer, ImageBlend, LatentFromBatch, ImageBatch, SplitImageBatch, ImageInvert, LatentUpscaleBy, SplitLatent, MergeLatent, BasicGuider, Canny
  - Custom (Impact, IPAdapter, AnimateDiff, VideoHelperSuite, BLIP, rgthree): ImpactFaceDetailer, IPAdapterApply, IPAdapterModelLoader, ADE_AnimateDiffLoaderGen1, VHS_LoadVideo, VHS_VideoCombine, BLIPCaption, RgthreePowerLoraLoader
- **10 new packs** in custom-nodes.json (16 → 26): ComfyUI-Inspire-Pack, ComfyUI-Workflow-Component, ComfyUI-PhotoMaker, ComfyUI-SUPIR, ComfyUI-Comfyroll, ComfyUI-Refacer, ComfyUI-ttN, ComfyUI-Plus, ComfyUI-Impact-Wildcard
- New data types in seed-node-compatibility: CLIP_VISION, CLIP_VISION_OUTPUT, IPADAPTER, MOTION_MODEL, GUIDER

### Changed

- metadata.total_nodes: 31 → 55
- metadata.total_packs: 16 → 26

---

## [1.1.0] – 2026-02-01

### Added

- Initial full base nodes set (50+ nodes): loaders, conditioning, sampling, latent, image, mask.
- Extended custom-nodes.json with 15+ popular packs.
- Extended node-compatibility.json with workflow_patterns and validation_rules.
- CHANGELOG.md created.

---

## [1.0.0] – 2026-02-01

### Added

- Initial structure: base-nodes.json (2 nodes), custom-nodes.json (2 packs), node-compatibility.json.
- knowledge/README.md, node-description-prompt-template.md.

---

*Format: [SemVer] – Date. Sections: Added, Changed, Deprecated, Removed, Fixed, Security.*
