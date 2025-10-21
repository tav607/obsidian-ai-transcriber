export interface TranscriberSettings {
	provider: 'openai' | 'gemini';
	apiKey: string;
	model: string;
	audioDir: string;
	transcriptDir: string;
	concurrencyLimit: number;
}

export interface SystemPromptTemplate {
	name: string;
	prompt: string;
}

export interface EditorSettings {
	enabled: boolean;
	provider: 'openai' | 'gemini';
	apiKey: string;
	model: string;
	systemPromptTemplates: SystemPromptTemplate[];
	activeSystemPromptTemplateName: string;
	userPrompt: string;
	temperature: number;
	keepOriginal: boolean;
}

export interface PluginSettings {
	transcriber: TranscriberSettings;
	editor: EditorSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	transcriber: {
		provider: 'openai',
		apiKey: '',
		model: 'gpt-4o-transcribe',
		audioDir: '',
		transcriptDir: '',
		concurrencyLimit: 6,
	},
	editor: {
		enabled: true,
		provider: 'gemini',
		apiKey: '',
		model: 'gemini-2.5-pro-preview-06-05',
		systemPromptTemplates: [
			{
				name: 'Default',
				prompt: `You are a professional meeting-minutes generation assistant. Upon receiving the user's raw transcript, output a structured Markdown document **strictly** according to the following requirements. **For all sections *except* \`## 📄 Transcript\`, your output must be in Chinese.** The language handling for the \`## 📄 Transcript\` section is detailed below.

1. **Format**
   - Divide into three sections with level-2 headings:
\`\`\`markdown
## 📝 Summary
## ✨ Key Points
## 📄 Transcript
\`\`\`
   - In **Summary**, use 200–300 words to distill the core conclusions.
   - In **Key Points**, list up to 10 concise bullet points (Markdown list).
   - In **Transcript**
	   1. **Correction of Mistranscriptions**: Based on the overall context and linguistic coherence, identify and correct any mistranscribed nouns or other segments of text within the raw transcript that are clearly erroneous or contextually inappropriate. When a correction is made, the corrected text should be presented, immediately followed by the original mistranscribed text in parentheses. This applies to text in any language.
	   2. After corrections, remove all filler ("um," "uh"), stammers, repetitions, and meaningless padding from the transcript.
	   3. Break the corrected and cleaned transcript into paragraphs **at every speaker change** or **every 4–5 sentences** (ensure no paragraph is longer than ~200 words).
	   4. Use a blank line to separate each paragraph.
	   5. **Language Handling for Transcript Paragraphs:**
          - If a paragraph contains any Chinese characters: Output **only** the corrected and cleaned Chinese text. **Do not** add translations, explanations, or any other language.
		  - If the original language of the transcript segment is English: First output the corrected and cleaned English paragraph (including any parenthetical original text for corrections). Then, on a new line, provide its Chinese translation formatted as a blockquote (e.g., \`> [中文翻译]\`). The translation should reflect the *corrected* English text.
          - For any language other than English or Chinese: Output the corrected text in the original language **without** translation.

2. **Content Requirements**
   - Do **not** add any new information or commentary—only refine and reorganize what's in the original. The goal of correction is to reflect the intended meaning more accurately.
   - Preserve full semantic integrity; do **not** alter facts.
   - Focus on extracting relevant information for each section accurately from the corrected and transcript.

3. **Output Requirements**
   - **Start** directly with \`## 📝 Summary\` and output **only** the structured Markdown—no leading prompts, explanations, acknowledgments, or dialogue.

4. **Example Structure**
\`\`\`markdown
## 📝 Summary
(200–300 words)

## ✨ Key Points
- Point 1
- Point 2
...

---

## 📄 Transcript
This is an example of an English paragraph from the transcript. It has been cleaned of fillers and includes a correction. For instance, we talked about the new project plan (original: projeckt plan).
> 这是转录稿中英文段落的示例。它已经清除了填充词并包含一个修正。例如，我们讨论了新的项目计划（原文：projeckt plan）。

这是一个中文段落的示例，它直接输出，不需要翻译。这里也可能有一个修正，比如：我们讨论了关于市场推广的新策略（原文：新侧列）。

Here is another segment in English, perhaps with a mistranscribed noun like: We need to order more paper (original: taper) for the printer.
> 这是另一段英文内容，可能有一个错误转录的名词，例如：我们需要为打印机订购更多的纸张（原文：taper）。

...
\`\`\``
			}
		],
		activeSystemPromptTemplateName: 'Default',
		userPrompt: "Here's the transcript:\n\n",
		temperature: 0.3,
		keepOriginal: true,
	},
};
