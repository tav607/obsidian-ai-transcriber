# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build Commands

- `npm install` - Install dependencies
- `npm run dev` - Start esbuild in watch mode for development (symlink output to vault for live reload)
- `npm run build` - Run TypeScript type checking and produce production bundle
- `npm run version` - Bump version in manifest.json/versions.json and stage for commit

## Architecture

This is an Obsidian plugin that records audio and transcribes it using the Gemini API, with optional AI-based post-editing of transcripts.

### Entry Point and Services

- `main.ts` - Plugin entry point, wires together services, commands, ribbon icon, context menu, and settings tab
- `src/services/recorder.ts` - Audio recording using Web Audio API (MediaRecorder)
- `src/services/transcriber.ts` - Audio transcription with preprocessing (resample to 16kHz mono, trim long silences, convert to MP3) using Gemini API with retry support
- `src/services/editor.ts` - Post-transcription AI editing using Gemini chat completion API
- `src/services/file.ts` - File operations within the vault (save audio, save transcripts, open files)

### Settings and UI

- `src/settings/types.ts` - TypeScript interfaces for plugin settings (`PluginSettings`, `TranscriberSettings`, `EditorSettings`, `SystemPromptTemplate`); both transcriber and editor support `thinkingLevel` configuration
- `src/settings/settingsTab.ts` - Settings tab implementation
- `src/ui/recordModal.ts` - Recording modal with start/stop controls
- `src/ui/SystemPromptTemplateSelectionModal.ts` - Modal for selecting system prompt templates before transcription/editing

### Data Flow

1. User records audio or selects existing audio file
2. If AI editing is enabled, user selects a system prompt template
3. `TranscriberService.transcribe()` preprocesses audio (resample to 16kHz mono, trim silences, convert to MP3) and sends to Gemini
4. If editing enabled, `EditorService.edit()` sends transcript through chat completion with selected template
5. `FileService` saves raw and/or edited transcripts to configured vault directory

## Code Style

- TypeScript with strict null checks
- Tab-based indentation, double quotes for strings/imports
- PascalCase for classes, camelCase for services/interfaces, SCREAMING_SNAKE_CASE for exported constants
- Run `npm run build` before pushing to verify type checking passes

## Testing

No automated test suite. Manual validation in an Obsidian sandbox vault:
- Test recording, external file transcription, and AI editing with Gemini provider
- Document observed behaviors in PR descriptions
