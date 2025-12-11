# Obsidian AI Transcriber

An Obsidian plugin that uses Google Gemini AI to record and transcribe audio into structured Markdown notes, with optional AI-based editing of transcripts.

## Features

- 🎤 **Record Audio**: Open a modal or click the ribbon icon to record audio within Obsidian.
- 🤖 **AI Transcription**: Transcribe recorded or imported audio files (`.webm`, `.m4a`, `.mp3`, `.wav`) to text using Google Gemini models.
- ✍️ **AI Editing** (optional): Automatically refine raw transcripts into structured notes (e.g., meeting minutes). Utilizes a customizable System Prompt via a template management system.
- 🎨 **System Prompt Templates**: Create, manage, and select different system prompts for the AI Editor to handle various transcript processing needs.
- 💾 **Flexible File Saving**: Save raw and/or edited transcripts to specified vault subdirectories.
- ⚙️ **Settings Tab**: Configure transcription and editing models, API keys, manage System Prompt templates, set editor user prompt, temperature, thinking level, and output directories.
- 🔄 **Context Menu**: Right-click an audio file in the file explorer to transcribe it directly.
- 📊 **Status Bar**: View plugin status (Idle, Recording…, Transcribing…, Editing…) in the status bar (bottom-right corner).

## Installation

1. Create a folder named `obsidian-ai-transcriber` in your vault's plugins directory: `YourVault/.obsidian/plugins/obsidian-ai-transcriber`
2. Copy the main.js, manifest.json, and styles.css files to the plugin folder
3. Reload Obsidian and enable the plugin in Settings

## Usage

### Recording Audio

- Click the microphone icon in the left ribbon or run the **"Record Audio"** command from the command palette.
- In the record modal, start recording. When done, you can choose:
    - **Stop & Save**: Saves the audio file to the configured "Audio Directory" without transcribing.
    - **Stop & Transcribe**: Saves the audio file and proceeds to transcription.
        - If AI Editing is enabled in settings, a modal will first appear asking you to select a System Prompt Template.
        - If you cancel template selection, only the audio file is saved, and transcription is aborted.
        - If confirmed, the audio is transcribed, and then the transcript is processed by the AI editor using the selected template.

### Transcribing Existing Audio Files

- Right-click any `.webm`, `.m4a`, `.mp3`, or `.wav` file in the file explorer.
- Select **"Transcribe with AI"**.
    - If AI Editing is enabled in settings, a modal will first appear asking you to select a System Prompt Template.
    - If you cancel template selection, the entire transcription task is aborted.
    - If confirmed, the audio is transcribed, and then the transcript is processed by the AI editor using the selected template.
    - If AI Editing is disabled, the audio is transcribed, and the raw transcript is saved.

### Editing Existing Transcripts

- Open a raw transcript file (typically a `.md` file).
- Run the **"Edit Current Transcript with AI"** command from the command palette.
    - A modal will appear asking you to select a System Prompt Template to use for editing.
    - If you cancel template selection, the editing process is aborted.
    - If confirmed, the AI editor will process the current text using the selected template.
- The plugin will then use the configured AI editor settings and the selected System Prompt to process and refine the transcript.

### Transcript Output

- Raw transcript: saved as `<audio_basename>_raw_transcript.md`
- Edited transcript: saved as `<audio_basename>_edited_transcript.md` (if AI Editing is enabled)
- Files are written to the **Transcript Directory** configured in settings.

## Settings

Open **Settings → Obsidian AI Transcriber** to configure:

- **Transcriber Settings**:
  - API Key: your Gemini API key
  - Model: transcription model (e.g., `gemini-2.5-flash`)
  - Temperature: sampling temperature
  - Thinking Level: `low` or `high` for Gemini's thinking mode
  - Audio Directory: where to save recorded audio
  - Transcript Directory: vault subfolder for transcripts

- **Editor Settings**:
  - Enable Editing: toggle AI post-editing.
  - API Key / Model: Gemini API key and model for the AI editor (e.g., `gemini-2.5-pro`).
  - **System Prompt Templates**:
    - **System Prompt Selector**: Choose the currently active template for general use (when not explicitly selected before an action).
    - **System Prompt Template Name**: Edit the name of the selected custom template (the "Default" template name cannot be changed).
    - **System Prompt**: Edit the content of the selected template.
    - **Delete Template**: Delete the currently selected custom template.
    - **New System Prompt Template**: Create new custom templates.
  - **User Prompt**: Specify user-level instructions for the editor (this prompt is sent along with the selected system prompt and the transcript).
  - Temperature: sampling temperature for the editor.
  - Thinking Level: `low` or `high` for Gemini's thinking mode.
  - Keep Original: save the raw transcript alongside the edited version.

## License

This plugin is released under the [Dynalist License](LICENSE).
