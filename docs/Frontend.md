# Frontend

A single-page application built with vanilla TypeScript. No framework — just the DOM API.

## Entry Point

`public/index.html` — App shell with CSS includes and a `<div id="app">` mount point.

## Module Overview (`public/src/`)

| Module            | Responsibility                                                 |
| ----------------- | -------------------------------------------------------------- |
| `main.ts`         | Bootstrap, event wiring, keyboard shortcuts, preset management |
| `chat.ts`         | Chat UI rendering, message submission, SSE stream handling     |
| `conversation.ts` | Conversation CRUD, virtual scrolling, message actions          |
| `sidebar.ts`      | Conversation list, folders, pin/star/archive UI                |
| `connection.ts`   | Server start/stop, model loading UI, status polling            |
| `models.ts`       | Model grid, model cards, model loading                         |
| `settings.ts`     | Settings modal, theme switching, engine config                 |
| `search.ts`       | Conversation search with fuzzy matching                        |
| `markdown.ts`     | Markdown-to-HTML rendering with code highlighting              |
| `formatter.ts`    | Inline formatting, thinking block extraction                   |
| `latex.ts`        | MathJax LaTeX rendering                                        |
| `attachments.ts`  | File upload, parsing (PDF, DOCX, XLSX, ZIP)                    |
| `image-viewer.ts` | Full-screen image viewer with pinch-zoom                       |
| `db.ts`           | IndexedDB wrapper for conversation persistence                 |
| `state.ts`        | Global app state (`AppState`)                                  |
| `types.ts`        | Shared TypeScript types/interfaces                             |
| `api.ts`          | Fetch wrapper for API calls                                    |
| `theme.ts`        | Theme switching (7 themes)                                     |
| `status.ts`       | Status bar updates, version fetch                              |
| `toast.ts`        | Toast notification system                                      |
| `utils.ts`        | DOM helpers, formatting utilities                              |
| `worker.ts`       | Web Worker for async markdown rendering                        |
| `mobile.ts`       | Touch gesture support                                          |
| `logger.ts`       | Client-side logging                                            |
| `globals.d.ts`    | Global type declarations                                       |

## State Management

A simple global `AppState` object in `state.ts` holds:

- `conversations` — list of all conversations
- `ui` — UI state (folders, active tab, sidebar visibility)
- `settings` — current app settings
- `models` — available models

## Key Patterns

- **Lazy loading**: Heavy modules (`search`, `image-viewer`) are dynamically imported on first use
- **Lazy library loading**: Third-party libs (PDF.js, Mammoth, SheetJS, JSZip) are loaded via dynamic `<script>` tags only when needed
- **Web Worker**: Markdown rendering with syntax highlighting runs in a background worker to keep the UI responsive
- **Virtual scrolling**: Handles 1000+ message conversations by recycling DOM nodes

## Styling

14 CSS files in `public/css/`:

| File               | Purpose                                 |
| ------------------ | --------------------------------------- |
| `variables.css`    | CSS custom properties (colors, spacing) |
| `base.css`         | Reset, typography, layout               |
| `chat.css`         | Message bubbles, code blocks            |
| `sidebar.css`      | Conversation list, folders              |
| `settings.css`     | Settings modal                          |
| `modal.css`        | Modal overlay                           |
| `message.css`      | Message actions                         |
| `input.css`        | Input area                              |
| `button.css`       | Button styles                           |
| `search.css`       | Search overlay                          |
| `status-bar.css`   | Footer status bar                       |
| `toast.css`        | Toast notifications                     |
| `image-viewer.css` | Image viewer overlay                    |
| `responsive.css`   | Mobile/tablet breakpoints               |
| `polish.css`       | Animations, transitions                 |
