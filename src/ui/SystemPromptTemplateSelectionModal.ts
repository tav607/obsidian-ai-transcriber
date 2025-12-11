import { App, Modal, Setting } from 'obsidian';
import ObsidianAITranscriber from '../../main';

export class SystemPromptTemplateSelectionModal extends Modal {
    plugin: ObsidianAITranscriber;
    onSubmit: (selectedTemplateName: string | null) => void;
    private selectedName: string;

    constructor(app: App, plugin: ObsidianAITranscriber, onSubmit: (selectedTemplateName: string | null) => void) {
        super(app);
        this.plugin = plugin;
        this.onSubmit = onSubmit;
        // Use the currently active template as default selection
        this.selectedName = plugin.settings.editor.activeSystemPromptTemplateName || 'Default';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('ai-transcriber-template-selection-modal');
        contentEl.createEl('h2', { text: 'Select System Prompt Template' });

        const templates = this.plugin.settings.editor.systemPromptTemplates;
        if (!templates || templates.length === 0) {
            // Should not happen if 'Default' template is always ensured
            contentEl.createEl('p', { text: 'No system prompt templates found. Please create one in settings.'});
            new Setting(contentEl)
                .addButton(btn => btn
                    .setButtonText('Close')
                    .setCta()
                    .onClick(() => {
                        this.onSubmit(null);
                        this.close();
                    }));
            return;
        }
        
        new Setting(contentEl)
            .setName('Template')
            .setDesc('Choose a system prompt template for the editor.')
            .addDropdown(dropdown => {
                templates.forEach(template => {
                    dropdown.addOption(template.name, template.name);
                });
                dropdown.setValue(this.selectedName);
                dropdown.onChange(value => {
                    this.selectedName = value;
                });
            });

        new Setting(contentEl)
            .addButton(btn => btn
                .setButtonText('Cancel')
                .onClick(() => {
                    this.onSubmit(null);
                    this.close();
                }))
            .addButton(btn => btn
                .setButtonText('Confirm')
                .setCta()
                .onClick(() => {
                    this.onSubmit(this.selectedName);
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
} 