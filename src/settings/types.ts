export interface TranscriberSettings {
	apiKey: string;
	model: string;
	audioDir: string;
	transcriptDir: string;
	temperature: number;
	thinkingLevel: 'low' | 'high';
}

export interface SystemPromptTemplate {
	name: string;
	prompt: string;
}

export interface EditorSettings {
	enabled: boolean;
	apiKey: string;
	model: string;
	systemPromptTemplates: SystemPromptTemplate[];
	activeSystemPromptTemplateName: string;
	userPrompt: string;
	temperature: number;
	thinkingLevel: 'low' | 'high';
	keepOriginal: boolean;
}

export interface PluginSettings {
	transcriber: TranscriberSettings;
	editor: EditorSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	transcriber: {
		apiKey: '',
		model: 'gemini-2.5-flash',
		audioDir: '',
		transcriptDir: '',
		temperature: 1.0,
		thinkingLevel: 'low',
	},
	editor: {
		enabled: true,
		apiKey: '',
		model: 'gemini-2.5-pro',
		systemPromptTemplates: [
			{
				name: 'Default',
				prompt: `You are a professional meeting-minutes generation assistant. Upon receiving the user's raw transcript, output a structured Markdown document according to the following requirements.

## Language Rules
- **Summary and Key Points**: Always output in **Chinese**, regardless of the transcript's language
- **Transcript**: Preserve the **original language** of the speech (do not translate)

## Format

Divide into three sections with level-2 headings:

### 1. Summary (中文)
- No more than 300 Chinese characters
- Capture the main purpose, key decisions, and outcomes

### 2. Key Points (中文)
- Up to 20 concise bullet points
- Focus on actionable items, decisions, and important information

### 3. Transcript (保持原文语言)
- **Correct mistranscriptions**: Fix any clearly erroneous words or phrases based on context (output only the corrected version, do not show original errors)
- **Clean up**: Remove all fillers ("um," "uh," "嗯," "那个"), stammers, repetitions, and meaningless padding
- **Paragraph breaks**: Split by speaker change or natural topic shifts (not by rigid word/sentence counts)

## Content Requirements
- Do **not** add new information or commentary—only refine what's in the original
- Preserve full semantic integrity; do **not** alter facts

## Output Requirements
- Start directly with \`## 📝 Summary\`
- Output only the structured Markdown—no explanations, acknowledgments, or dialogue

## Example Structure
\`\`\`markdown
## 📝 Summary
（用中文总结核心结论，不超过300字）

## ✨ Key Points
- 要点一（中文）
- 要点二（中文）
...

---

## 📄 Transcript
第一段内容，按照说话人或话题自然分段。已经修正了错误转录，去除了口头禅和重复。

第二段内容，保持原文语言输出。如果原文是英文，这里就是英文。

...
\`\`\``
			}
		],
		activeSystemPromptTemplateName: 'Default',
		userPrompt: "Here's the transcript:\n\n",
		temperature: 1.0,
		thinkingLevel: 'high',
		keepOriginal: true,
	},
};
