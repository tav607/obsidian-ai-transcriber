import { MarkdownView, Notice, Plugin, TFile } from 'obsidian';
import RecordModal from './src/ui/recordModal';
import { RecorderService } from './src/services/recorder';
import { FileService } from './src/services/file';
import SettingsTab from './src/settings/settingsTab';
import { PluginSettings, DEFAULT_SETTINGS } from './src/settings/types';
import { TranscriberService } from './src/services/transcriber';
import { EditorService } from './src/services/editor';
import { SystemPromptTemplateSelectionModal } from './src/ui/SystemPromptTemplateSelectionModal';

export default class ObsidianAITranscriber extends Plugin {
	settings: PluginSettings;
	recorder: RecorderService;
	transcriber: TranscriberService;
	fileService: FileService;
	editorService: EditorService;
	statusBarItem: HTMLElement;

	async onload() {
		await this.loadSettings();
		// Initialize RecorderService so state persists across modals
		this.recorder = new RecorderService();
		// Initialize TranscriberService
		this.transcriber = new TranscriberService();
		// Initialize FileService and EditorService
		this.fileService = new FileService(this.app);
		this.editorService = new EditorService();

		// Add status bar item for plugin status
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatus('Transcriber Idle');

		// Ribbon button for recording
		const ribbonIconEl = this.addRibbonIcon('microphone', 'Record Audio', () => {
			new RecordModal(this.app, this).open();
		});
		ribbonIconEl.addClass('obsidian-ai-transcriber-ribbon');

		// Command for recording
		this.addCommand({
			id: 'obsidian-ai-transcriber-record',
			name: 'Record Audio',
			callback: () => {
				new RecordModal(this.app, this).open();
			}
		});

		// Command for editing the current raw transcript
		this.addCommand({
			id: 'obsidian-ai-transcriber-edit-transcript',
			name: 'Edit Current Transcript with AI',
			checkCallback: (checking: boolean) => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					if (!checking) {
						const file = view.file;
						if (!file || file.extension !== 'md') {
							new Notice('Please open a Markdown file to edit.');
							return;
						}

						(async () => {
							const originalText = view.editor ? view.editor.getValue() : await this.app.vault.read(file);

							if (!originalText.trim()) {
								new Notice('The file is empty.');
								return;
							}

							if (!this.settings.editor.enabled) {
								new Notice('AI Editor is not enabled in settings. Editing skipped.');
								return;
							}

							// Show template selection modal
							new SystemPromptTemplateSelectionModal(this.app, this, async (selectedTemplateName) => {
								if (!selectedTemplateName) {
									new Notice('Template selection cancelled. Editing aborted.');
									return;
								}

								const selectedTemplate = this.settings.editor.systemPromptTemplates.find(t => t.name === selectedTemplateName);
								if (!selectedTemplate) {
									new Notice('Selected template not found. Editing aborted.');
									return;
								}

								new Notice('Editing transcript with AI using template: ' + selectedTemplateName);
								const statusCallback = (status: string) => this.updateStatus(status);

								try {
									const editedText = await this.editorService.edit(originalText, this.settings.editor, selectedTemplate.prompt, statusCallback);
									const dir = file.parent ? file.parent.path : this.settings.transcriber.transcriptDir;
									const baseName = file.basename.replace(/_raw_transcript$/, '').replace(/_edited_transcript$/, '');
									
									const editedFileName = `${baseName}_edited_transcript.md`;
									const editedPath = await this.fileService.saveTextWithName(editedText, dir, editedFileName);
									
									new Notice(`Edited transcript saved to ${editedPath}`);
									await this.fileService.openFile(editedPath);
								} catch (error: unknown) {
									new Notice(`Error editing transcript: ${(error as Error).message}`);
									console.error('Error editing transcript:', error);
								} finally {
									this.updateStatus('Transcriber Idle');
								}
							}).open();
						})();
					}
					return true;
				}
				return false;
			}
		});

		// Settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Context menu for audio files
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && (file.extension === 'webm' || file.extension === 'm4a' || file.extension === 'mp3' || file.extension === 'wav')) {
					menu.addItem((item) => {
						item.setTitle('Transcribe with AI')
							.setIcon('microphone')
							.onClick(async () => {
								const processAudioFile = async (systemPromptOverride?: string) => {
									try {
										const arrayBuffer = await this.app.vault.readBinary(file);
										const mimeTypes: Record<string, string> = {
											'm4a': 'audio/mp4',
											'webm': 'audio/webm',
											'mp3': 'audio/mpeg',
											'wav': 'audio/wav'
										};
										const blob = new Blob([arrayBuffer], { type: mimeTypes[file.extension] || '' });
										const baseName = file.name.replace(/\.[^/.]+$/, '');
										await this.processTranscription(blob, baseName, systemPromptOverride);
									} catch (error: unknown) {
										new Notice(`Error: ${(error as Error).message}`);
										console.error(error);
									} finally {
										this.updateStatus('Transcriber Idle');
									}
								};

								if (this.settings.editor.enabled) {
									new SystemPromptTemplateSelectionModal(this.app, this, async (selectedTemplateName) => {
										if (!selectedTemplateName) {
											new Notice('Template selection cancelled. Transcription aborted.');
											this.updateStatus('Transcriber Idle');
											return;
										}
										const selectedTemplate = this.settings.editor.systemPromptTemplates.find(t => t.name === selectedTemplateName);
										if (!selectedTemplate) {
											new Notice('Selected template not found. Transcription aborted.');
											this.updateStatus('Transcriber Idle');
											return;
										}
										await processAudioFile(selectedTemplate.prompt);
									}).open();
								} else {
									await processAudioFile();
								}
							});
					});
				}
			})
		);
	}

	/**
	 * Cleanup when the plugin is unloaded.
	 */
	public onunload(): void {
		// Optional cleanup code
	}

	/**
	 * Shared workflow for transcribing audio and optionally editing with AI.
	 * @param blob Audio blob to transcribe
	 * @param baseName Base name for output files (without extension)
	 * @param systemPromptOverride System prompt to use for editing (undefined = skip editing)
	 */
	public async processTranscription(
		blob: Blob,
		baseName: string,
		systemPromptOverride?: string
	): Promise<void> {
		const dir = this.settings.transcriber.transcriptDir;
		const statusCallback = (status: string) => this.updateStatus(status);

		new Notice('Transcribing audio…');
		const transcript = await this.transcriber.transcribe(blob, this.settings.transcriber, statusCallback);

		if (this.settings.editor.enabled && systemPromptOverride !== undefined) {
			if (this.settings.editor.keepOriginal) {
				const rawFileName = `${baseName}_raw_transcript.md`;
				const rawPath = await this.fileService.saveTextWithName(transcript, dir, rawFileName);
				new Notice(`Raw transcript saved to ${rawPath}`);
			}
			new Notice('Editing transcript with AI...');
			const edited = await this.editorService.edit(transcript, this.settings.editor, systemPromptOverride, statusCallback);
			const editedFileName = `${baseName}_edited_transcript.md`;
			const editedPath = await this.fileService.saveTextWithName(edited, dir, editedFileName);
			new Notice(`Edited transcript saved to ${editedPath}`);
			await this.fileService.openFile(editedPath);
		} else {
			const rawFileName = `${baseName}_raw_transcript.md`;
			const transcriptPath = await this.fileService.saveTextWithName(transcript, dir, rawFileName);
			new Notice(`Transcript saved to ${transcriptPath}`);
			await this.fileService.openFile(transcriptPath);
		}
	}

	/**
	 * Load plugin settings from disk.
	 */
	public async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Ensure nested defaults for newly added fields
		if (!this.settings.transcriber) {
			this.settings.transcriber = { ...DEFAULT_SETTINGS.transcriber };
		}
	}

	/**
	 * Save plugin settings to disk.
	 */
	public async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Update the status bar text to reflect current plugin state.
	 * @param status The status text to display.
	 */
	public updateStatus(status: string): void {
		this.statusBarItem.setText(status);
	}
}
