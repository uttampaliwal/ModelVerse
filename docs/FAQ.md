# FAQ

## General

### What LLM backends are supported?

7 backends: llama.cpp, Ollama, LM Studio, OpenAI (and compatible), KoboldCpp, vLLM, and Transformers.js. Switch at runtime with no restart.

### Can I use cloud models alongside local ones?

Yes. Add OpenAI as an engine and switch freely between local and cloud models.

### How do I add my own model?

Place `.gguf` files in any monitored directory. ModelVerse auto-scans LM Studio, Ollama, llama.cpp, GPT4All, Jan, Open WebUI, Transformers cache, and custom paths.

### Does it support GPU acceleration?

Yes. llama.cpp uses GPU layers configurable via profiles (0 = CPU only, 999 = max offloading). GPU utilization is shown in the status bar.

### Is my data private?

All conversations and settings stay on your machine. Conversations are stored in IndexedDB in the browser; profiles and metadata on the server filesystem. No data is sent to external services unless you configure the OpenAI engine.

## Setup

### What Node.js version do I need?

Node.js 20+ (tested on 22).

### Can I run it on a headless server?

Yes. The server runs without a display. Access the UI from any browser on the network. Set `host` to `0.0.0.0` in settings.

### How do I update?

Pull the latest changes and rebuild: `git pull && npm install && npm run build`.

## Troubleshooting

### The server won't start

Check `logs/errors.log` for details. Common issues: port already in use, missing llama.cpp binary, invalid settings.json.

### Models aren't being detected

Ensure your model directory is in the scanner configuration. Run a manual scan from the settings panel or trigger `POST /api/models/scan`.

## Limitations

- Single-user (no multi-user or authentication yet)
- No built-in model downloads
- RAG is keyword-based (semantic search planned)
- Transformers.js engine is a stub (not yet functional)
- Plugins require server restart to fully take effect on enable/disable
