import { GoogleGenAI, type ThinkingConfig } from "@google/genai";
import { EditorSettings } from '../settings/types';

export class EditorService {
	/**
	 * Edit and format transcription text using Gemini API.
	 * @param text The transcript text to edit
	 * @param settings EditorSettings from plugin configuration
	 * @param systemPromptOverride Optional: A specific system prompt to use for this edit, overriding settings.
	 * @param onStatus Optional callback to report status updates
	 */
	async edit(
		text: string,
		settings: EditorSettings,
		systemPromptOverride?: string,
		onStatus?: (status: string) => void
	): Promise<string> {
		if (!settings.apiKey) {
			throw new Error('Editor API key is not configured');
		}

		// Determine the system prompt to use
		let systemPromptToUse = '';
		if (systemPromptOverride !== undefined) {
			systemPromptToUse = systemPromptOverride;
		} else if (settings.systemPromptTemplates && settings.systemPromptTemplates.length > 0) {
			const activeTemplate = settings.systemPromptTemplates.find(
				t => t.name === settings.activeSystemPromptTemplateName
			);
			if (activeTemplate) {
				systemPromptToUse = activeTemplate.prompt;
			} else {
				// Fallback to the first template if active one not found or name is out of sync
				const firstTemplate = settings.systemPromptTemplates[0];
				if (firstTemplate) {
					systemPromptToUse = firstTemplate.prompt;
				}
			}
		}

		// Combine user prompt and transcript text
		const userContent = settings.userPrompt
			? `${settings.userPrompt}\n\n${text}`
			: text;

		// Use Google GenAI SDK for Gemini editing
		const genAI = new GoogleGenAI({ apiKey: settings.apiKey });
		onStatus?.('✨ Generating edited text...');

		try {
			const response = await genAI.models.generateContent({
				model: settings.model,
				contents: [{ role: "user", parts: [{ text: userContent }] }],
				config: {
					temperature: settings.temperature,
					systemInstruction: systemPromptToUse || undefined,
					thinkingConfig: {
						thinkingLevel: settings.thinkingLevel,
					} as unknown as ThinkingConfig,
				},
			});

			const result = response.text;

			if (typeof result === 'string') {
				return result;
			} else {
				let detailedError = 'Invalid response from Gemini editing API: No text content found.';
				if (response.promptFeedback) {
					detailedError += ` Prompt feedback: ${JSON.stringify(response.promptFeedback)}`;
					if (response.promptFeedback.blockReason) {
						detailedError += ` Block Reason: ${response.promptFeedback.blockReason}`;
						if (response.promptFeedback.blockReasonMessage) {
							detailedError += ` (${response.promptFeedback.blockReasonMessage})`;
						}
					}
				}
				console.error('Full Gemini API response (when text is undefined):', JSON.stringify(response, null, 2));
				throw new Error(detailedError);
			}
		} catch (error: unknown) {
			console.error('Error during Gemini API call or processing:', error);
			throw new Error(`Gemini API request failed: ${(error as Error).message || 'Unknown error'}`);
		}
	}
} 