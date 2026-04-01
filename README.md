# scattered binaries

Auto-discover binary files (PDF, DOCX, XLSX, etc.) scattered across subdirectories and serve them via `_canonical_uri` tiddlers — no manual `tiddlywiki.files` needed per directory.

## Features

- **Profile-based discovery** — configure which directories to scan via JSON profiles
- **Boot cleanup** — removes duplicate tiddlers created by TW's boot scanner for binary files
- **HTTP route** — serves files via configurable route prefix with path traversal protection
- **Meta-sidecar aware** — skips files that have `.meta` sidecars (defers to TW native handling)
- **Extension filtering** — only known binary extensions are served (blocks `.env`, `.json`, etc.)

## Prerequisites

- TiddlyWiki 5.3.0+ (Node.js server edition)

## Quick Start

1. Configure profiles in plugin settings (default profile scans `tiddlers/tender/#NNN/documents/`)
2. Restart TiddlyWiki — binary files are auto-discovered and registered as `_canonical_uri` tiddlers
3. Access files via the configured route prefix (e.g., `/tender-docs/%23512/filename.pdf`)

## License

MIT
