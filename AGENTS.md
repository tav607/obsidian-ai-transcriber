# Repository Guidelines

## Project Structure & Module Organization
- `main.ts` is the Obsidian entry point and wires services, settings, and UI. The compiled bundle lives in `main.js`.
- `src/services` hosts core logic for recording, file management, and AI transcription/editing; each service is scoped to a single responsibility.
- `src/settings` contains the plugin setting tab and typed configuration models.
- `src/ui` provides modal dialogs for recording and template selection. Shared styling sits in `styles.css`.
- Build tooling (`esbuild.config.mjs`, `tsconfig.json`, `version-bump.mjs`) and metadata (`manifest.json`, `versions.json`) stay at the repo root.

## Build, Test, and Development Commands
- `npm install` to sync dependencies after cloning or updating.
- `npm run dev` launches esbuild in watch mode; symlink the output folder into your vault for live reload.
- `npm run build` performs a strict `tsc` type check and emits the production bundle via esbuild.
- `npm run version` bumps `manifest.json`/`versions.json`; commit the staged files with your release notes.

## Coding Style & Naming Conventions
- TypeScript with strict null checks; keep definitions strongly typed and prefer early error handling.
- Match existing tab-based indentation, trailing commas where useful, and double quotes for imports/strings.
- Classes stay PascalCase, services/interfaces camelCase, and constants SCREAMING_SNAKE_CASE when exported.
- Run `npm run build` before pushing to verify the TypeScript compiler stays clean; add eslint rules inline if you introduce new linting.

## Testing Guidelines
- There is no automated test suite; rely on manual validation inside an Obsidian sandbox vault.
- After `npm run dev`, load the plugin, exercise recording, external file transcription, and AI editing with both OpenAI and Gemini providers.
- Document observed behaviours or regressions in your PR description; attach sample transcripts when relevant.

## Commit & Pull Request Guidelines
- Follow the existing history: short, sentence-case subjects (e.g., `Remove unused thinkingConfig...`) or semantic version tags (`1.1.5`).
- Group related changes per commit; avoid bundling unrelated refactors with feature work.
- PRs need a concise summary, linked vault issue or feature request, test notes, and screenshots/GIFs when UI modals change.
- Call out any setting schema changes so maintainers can update documentation and migration paths.

## Security & Configuration Tips
- Never commit real API keys; Obsidian stores provider credentials per vault, so share instructions, not secrets.
- Validate network calls respect user provider choices and avoid logging raw transcripts unless necessary for debugging.
