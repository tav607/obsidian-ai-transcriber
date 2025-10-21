import { App, PluginSettingTab, Setting, Modal, TextComponent, TextAreaComponent, Notice } from 'obsidian';
import ObsidianAITranscriber from '../../main';
import { SystemPromptTemplate, DEFAULT_SETTINGS } from './types';

export default class SettingsTab extends PluginSettingTab {
	plugin: ObsidianAITranscriber;

	constructor(app: App, plugin: ObsidianAITranscriber) {
		super(app, plugin);
		this.plugin = plugin;
	}

	private getActiveTemplate(): SystemPromptTemplate | undefined {
		const activeName = this.plugin.settings.editor.activeSystemPromptTemplateName;
		if (!this.plugin.settings.editor.systemPromptTemplates) {
			this.plugin.settings.editor.systemPromptTemplates = []; // Initialize if undefined
		}
		// Ensure there is always a default template if the list is empty or active one is not found
		if (!this.plugin.settings.editor.systemPromptTemplates.find(t => t.name === 'Default')) {
			this.plugin.settings.editor.systemPromptTemplates.unshift({
				name: 'Default',
				prompt: "You are a professional meeting-minutes generation assistant. Upon receiving the user's raw transcript, output a structured Markdown document **strictly** according to the following requirements—and ensure that the language you use matches the language of the raw transcript.\n\n1. **Format**\n\n   - Divide into three sections with level-2 headings:\n```\n## 📝 Summary\n## ✨ Key Points\n## 📄 Transcript\n```\n   - In **Summary**, use 200–300 words to distill the core conclusions.\n   - In **Key Points**, list 5–10 concise bullet points (Markdown list).\n   - In **Transcript**\n\t   1. Remove all filler (\"um,\" \"uh\"), stammers, repetitions, and meaningless padding.\n\t   2. Break into paragraphs **at every speaker change** or **every 4–5 sentences** (no paragraph longer than ~200 words).\n\t   3. Use a blank line to separate each paragraph.\n\n2. **Content Requirements**\n\n   - Do **not** add any new information or commentary—only refine and reorganize what's in the original.\n   - Preserve full semantic integrity; do **not** alter facts.\n\n3. **Output Requirements**\n\n   - **Start** directly with `## 📝 Summary` and output **only** the structured Markdown—no leading prompts, explanations, acknowledgments, or dialogue.\n\n4. **Example Structure**\n```markdown\n## 📝 Summary\n(200–300 words)\n\n## ✨ Key Points\n- Point 1\n- Point 2\n…\n\n## 📄 Transcript\nParagraph 1\n\nParagraph 2\n\n…\n```"
			});
			if (this.plugin.settings.editor.systemPromptTemplates.length === 1) {
				this.plugin.settings.editor.activeSystemPromptTemplateName = 'Default';
			}
		}
		
		let template = this.plugin.settings.editor.systemPromptTemplates.find(t => t.name === activeName);
		if (!template && this.plugin.settings.editor.systemPromptTemplates.length > 0) {
			// If active template not found, default to the first one (which should be 'Default')
			this.plugin.settings.editor.activeSystemPromptTemplateName = this.plugin.settings.editor.systemPromptTemplates[0].name;
			template = this.plugin.settings.editor.systemPromptTemplates[0];
		}
		return template;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass('ai-transcriber-settings');

		// Ensure systemPromptTemplates and activeSystemPromptTemplateName are initialized
		if (!this.plugin.settings.editor.systemPromptTemplates) {
			this.plugin.settings.editor.systemPromptTemplates = [];
		}
		// This will also create 'Default' if it's missing.
		this.getActiveTemplate(); 
		// If after getActiveTemplate, it's still empty (e.g. 'Default' was also missing and created)
		// and active name is not set, set it to 'Default'.
		if (!this.plugin.settings.editor.activeSystemPromptTemplateName && this.plugin.settings.editor.systemPromptTemplates.some(t=>t.name === 'Default')) {
			this.plugin.settings.editor.activeSystemPromptTemplateName = 'Default';
		}

		// Transcriber Settings
		containerEl.createEl('h2', { text: '🎙️ Transcriber Settings' });
		new Setting(containerEl)
			.setName('API Provider')
			.setDesc('Choose OpenAI or Gemini')
			.addDropdown(drop => drop
				.addOption('openai', 'OpenAI')
				.addOption('gemini', 'Gemini')
				.setValue(this.plugin.settings.transcriber.provider)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.provider = value as 'openai' | 'gemini';
					await this.plugin.saveSettings();
					this.display(); // Refresh to show conditional fields if any
				})
			);
		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Transcriber API Key')
			.addText(text => text
				.setPlaceholder('Your API Key')
				.setValue(this.plugin.settings.transcriber.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.apiKey = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Model Name')
			.setDesc('Specify the model to use for transcription.')
			.addText(text => text
				.setPlaceholder('Example: gpt-4o-transcribe')
				.setValue(this.plugin.settings.transcriber.model)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.model = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Audio Directory')
			.setDesc('Where to save recordings (relative to vault root)')
			.addText(text => text
				.setPlaceholder('Recordings/')
				.setValue(this.plugin.settings.transcriber.audioDir)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.audioDir = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Transcript Directory')
			.setDesc('Where to save transcripts (relative to vault root)')
			.addText(text => text
				.setPlaceholder('Transcripts/')
				.setValue(this.plugin.settings.transcriber.transcriptDir)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.transcriptDir = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Max Concurrent Requests')
			.setDesc('Maximum number of audio chunks to transcribe in parallel (minimum 1).')
			.addText(text => {
				text
					.setPlaceholder('6')
					.setValue(String(this.plugin.settings.transcriber.concurrencyLimit))
					.onChange(async (value) => {
						const parsed = Number.parseInt(value.trim(), 10);
						const nextValue = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.transcriber.concurrencyLimit;
						this.plugin.settings.transcriber.concurrencyLimit = nextValue;
						await this.plugin.saveSettings();
					});
				text.inputEl.type = 'number';
				text.inputEl.min = '1';
			});

		// Editor Settings
		containerEl.createEl('h2', { text: '✏️ Editor Settings' });
		new Setting(containerEl)
			.setName('Enable Editor')
			.setDesc('Toggle to enable Editor API enhancements')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.editor.enabled)
				.onChange(async (value) => {
					this.plugin.settings.editor.enabled = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide editor settings
				})
			);

		if (this.plugin.settings.editor.enabled) {
			new Setting(containerEl)
				.setName('API Provider')
				.setDesc('Choose OpenAI or Gemini')
				.addDropdown(drop => drop
					.addOption('openai', 'OpenAI')
					.addOption('gemini', 'Gemini')
					.setValue(this.plugin.settings.editor.provider)
					.onChange(async (value) => {
						this.plugin.settings.editor.provider = value as 'openai' | 'gemini';
						await this.plugin.saveSettings();
						this.display(); // Refresh
					})
				);
			new Setting(containerEl)
				.setName('API Key')
				.setDesc('Editor API Key')
				.addText(text => text
					.setPlaceholder('Your API Key.')
					.setValue(this.plugin.settings.editor.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.editor.apiKey = value;
						await this.plugin.saveSettings();
					})
				);
			new Setting(containerEl)
				.setName('Model Name')
				.setDesc('Specify the model to use for editing.')
				.addText(text => text
					.setPlaceholder('Example: gemini-2.5-flash-preview-04-17')
					.setValue(this.plugin.settings.editor.model)
					.onChange(async (value) => {
						this.plugin.settings.editor.model = value;
						await this.plugin.saveSettings();
					})
				);


			const templates = this.plugin.settings.editor.systemPromptTemplates;
			const activeTemplateName = this.plugin.settings.editor.activeSystemPromptTemplateName;

			// Dropdown for selecting active template
			new Setting(containerEl)
				.setName('System Prompt Selector')
				.setDesc('Select the system prompt template to use.')
				.addDropdown(dropdown => {
					templates.forEach(template => {
						dropdown.addOption(template.name, template.name);
					});
					dropdown.setValue(activeTemplateName)
						.onChange(async (value) => {
							this.plugin.settings.editor.activeSystemPromptTemplateName = value;
							await this.plugin.saveSettings();
							this.display(); // Re-render to update template name and prompt fields
						});
				});
			
			const currentActiveTemplate = this.getActiveTemplate();

			if (currentActiveTemplate) {
				// Text input for template name (editable if not 'Default')
				new Setting(containerEl)
					.setName('System Prompt Template Name')
					.setDesc(currentActiveTemplate.name === 'Default' ? 'The "Default" template name cannot be changed.' : 'Edit the name of the current template.')
					.addText(text => {
						text
							.setValue(currentActiveTemplate.name)
							.setDisabled(currentActiveTemplate.name === 'Default');

						// Save on blur (when focus is lost)
						text.inputEl.onblur = async (event) => {
							const newName = (event.target as HTMLInputElement).value.trim();
							if (newName && newName !== currentActiveTemplate.name) {
								// Check if newName already exists (excluding the current template itself if its name hasn't effectively changed)
								if (templates.some(t => t.name === newName)) {
									new Notice(`Template name "${newName}" already exists. Please choose a different name.`);
									(event.target as HTMLInputElement).value = currentActiveTemplate.name; // Revert UI to old name
									return;
								}
								currentActiveTemplate.name = newName;
								this.plugin.settings.editor.activeSystemPromptTemplateName = newName;
								await this.plugin.saveSettings();
								this.display(); // Re-render to update dropdown and other fields
							} else if (newName === currentActiveTemplate.name) {
								// If the name is the same (e.g., user clicked in and out), no need to do anything
							} else if (!newName && currentActiveTemplate.name !== 'Default'){
								// If newName is empty and it's not the 'Default' template, revert to old name
								new Notice('Template name cannot be empty.');
								(event.target as HTMLInputElement).value = currentActiveTemplate.name; // Revert UI
							}
						};
						// Optional: Save on Enter key press as well
						text.inputEl.onkeydown = async (event) => {
							if (event.key === 'Enter') {
								text.inputEl.blur(); // Trigger the blur event to save
								event.preventDefault(); // Prevent default Enter behavior (e.g. form submission)
							}
						};
					});

				// TextArea for template prompt
				new Setting(containerEl)
					.setName('System Prompt')
					.setDesc('Specify system-level instructions for the editor for this template.')
					.addTextArea(textArea => {
						textArea
							.setValue(currentActiveTemplate.prompt)
							.onChange(async (value) => {
								currentActiveTemplate.prompt = value;
								await this.plugin.saveSettings();
							});
						textArea.inputEl.rows = 10;
						textArea.inputEl.style.width = '100%';
						textArea.inputEl.style.minHeight = '150px';
					});

				// Button to delete active template (if not 'Default')
				if (currentActiveTemplate.name !== 'Default') {
					new Setting(containerEl)
						.addButton(button => button
							.setButtonText(`Delete "${currentActiveTemplate.name}" template`)
							.setWarning() // Or setCta() for a more prominent warning
							.onClick(async () => {
								// Confirmation Modal
								const confirmModal = new Modal(this.app);
								confirmModal.contentEl.createEl('h2', {text: 'Confirm Deletion'});
								confirmModal.contentEl.createEl('p', {text: `Are you sure you want to delete the template "${currentActiveTemplate.name}"? This action cannot be undone.`});
								
								new Setting(confirmModal.contentEl)
									.addButton(btn => btn
										.setButtonText('Cancel')
										.onClick(() => confirmModal.close()))
									.addButton(btn => btn
										.setButtonText('Delete')
										.setWarning()
										.onClick(async () => {
											this.plugin.settings.editor.systemPromptTemplates = templates.filter(t => t.name !== currentActiveTemplate.name);
											this.plugin.settings.editor.activeSystemPromptTemplateName = 'Default'; // Fallback to Default
											await this.plugin.saveSettings();
											confirmModal.close();
											this.display(); // Re-render
										}));
								confirmModal.open();
							})
						);
				}
			}

			// Button to create a new template
			new Setting(containerEl)
				.setName('New System Prompt Template')
				.setDesc('Add a new template for system prompts.')
				.addButton(button => button
					.setButtonText('Create New Template')
					.onClick(async () => {
						new NewTemplateModal(this.app, this.plugin, (result) => {
							if (result) {
								const newTemplate: SystemPromptTemplate = { name: result.name, prompt: result.prompt };
								this.plugin.settings.editor.systemPromptTemplates.push(newTemplate);
								this.plugin.settings.editor.activeSystemPromptTemplateName = newTemplate.name;
								this.plugin.saveSettings().then(() => this.display());
							}
						}).open();
					})
				);

			// --- End of System Prompt Template Management ---

			new Setting(containerEl)
				.setName('User Prompt')
				.setDesc('Specify user-level instructions for the editor.')
				.addTextArea(textArea => {
					textArea
						.setPlaceholder('')
						.setValue(this.plugin.settings.editor.userPrompt)
						.onChange(async (value) => {
							this.plugin.settings.editor.userPrompt = value;
							await this.plugin.saveSettings();
						});
					textArea.inputEl.rows = 3;
					textArea.inputEl.style.width = '100%';
				});
			new Setting(containerEl)
				.setName('Temperature')
				.setDesc('Enter a value between 0.0 and 1.0. Suggested value: 0.3.')
				.addText(text => text
					.setPlaceholder('0.0-1.0')
					.setValue(this.plugin.settings.editor.temperature.toString())
					.onChange(async (value) => {
						const num = parseFloat(value);
						if (!isNaN(num) && num >= 0 && num <= 1) {
							this.plugin.settings.editor.temperature = num;
							await this.plugin.saveSettings();
						}
					})
				);
			new Setting(containerEl)
				.setName('Keep Original Transcript')
				.setDesc('Whether to keep original transcript when editing')
				.addToggle(toggle => toggle
					.setValue(this.plugin.settings.editor.keepOriginal)
					.onChange(async (value) => {
						this.plugin.settings.editor.keepOriginal = value;
						await this.plugin.saveSettings();
					})
				);
		}
	}
}

class NewTemplateModal extends Modal {
	plugin: ObsidianAITranscriber;
	onSubmit: (result: { name: string, prompt: string } | null) => void;
	nameInput: TextComponent;
	promptInput: TextAreaComponent;

	constructor(app: App, plugin: ObsidianAITranscriber, onSubmit: (result: { name: string, prompt: string } | null) => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Create New System Prompt Template' });

		let newName = 'New Template';
		let i = 1;
		while (this.plugin.settings.editor.systemPromptTemplates.some(t => t.name === newName)) {
			newName = `New Template ${++i}`;
		}
		
		new Setting(contentEl)
			.setName('System Prompt Template Name')
			.addText(text => {
				this.nameInput = text;
				text.setValue(newName)
					.setPlaceholder('Enter template name');
			});

		new Setting(contentEl)
			.setName('System Prompt Template')
			.addTextArea(area => {
				this.promptInput = area;
				area.setValue('')
					.setPlaceholder('Enter system prompt content for this template');
				area.inputEl.rows = 16;
				area.inputEl.style.width = '100%';
				area.inputEl.style.minHeight = '120px';
				area.inputEl.style.resize = 'none';
			});
		
		new Setting(contentEl)
			.addButton(button => button
				.setButtonText('Cancel')
				.onClick(() => {
					this.onSubmit(null);
					this.close();
				}))
			.addButton(button => button
				.setButtonText('Save Template')
				.setCta()
				.onClick(() => {
					const name = this.nameInput.getValue().trim();
					const prompt = this.promptInput.getValue();
					if (!name) {
						// Add some validation feedback if name is empty
						return;
					}
					if (this.plugin.settings.editor.systemPromptTemplates.some(t => t.name === name)) {
						// Add some validation feedback if name is taken
						// Potentially use a Notice
						return;
					}
					this.onSubmit({ name, prompt });
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
} 
