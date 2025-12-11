import { GoogleGenAI, createPartFromUri, type ThinkingConfig } from "@google/genai";
import { Mp3Encoder } from "@breezystack/lamejs";

export class TranscriberService {
	private readonly MAX_ATTEMPTS = 3;
	private readonly RETRY_DELAY_MS = 1000;

	/**
	 * Retry a function with exponential backoff
	 */
	private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
		let lastError: Error | null = null;
		for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error as Error;
				if (attempt < this.MAX_ATTEMPTS) {
					const delay = this.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
					console.warn(`⚠️ Transcription failed (attempt ${attempt}/${this.MAX_ATTEMPTS}): ${lastError.message}. Retrying in ${delay}ms...`);
					await new Promise(resolve => setTimeout(resolve, delay));
				}
			}
		}
		throw new Error(`Transcription failed after ${this.MAX_ATTEMPTS} attempts: ${lastError?.message}`);
	}

	/**
	 * Clean up repetitive characters in transcription result
	 * Remove sequences where the same character repeats more than a threshold
	 */
	private cleanupRepetitiveCharacters(text: string, maxRepeats = 10): string {
		if (!text || text.length === 0) return text;

		// Use regex to find and replace repetitive characters
		// This pattern matches any character (including Chinese characters) repeated more than maxRepeats times
		const pattern = new RegExp(`(.)\\1{${maxRepeats},}`, 'g');

		const cleanedText = text.replace(pattern, (match, char) => {
			console.log(`🧹 Found repetitive character "${char}" repeated ${match.length} times, cleaning to single occurrence`);
			return char; // Replace with single character
		});

		return cleanedText;
	}

	/**
	 * Transcribe audio blob using Gemini API.
	 * @param blob Audio blob to transcribe
	 * @param settings TranscriberSettings from plugin configuration
	 * @param onStatus Optional callback to report status updates
	 */
	async transcribe(
		blob: Blob,
		settings: import('../settings/types').TranscriberSettings,
		onStatus?: (status: string) => void
	): Promise<string> {
		if (!settings.apiKey) {
			throw new Error('Transcriber API key is not configured');
		}

		console.log('🎵 Starting audio transcription processing...');
		const overallStartTime = Date.now();

		// Preprocess audio: resample to 16kHz mono, trim silence, convert to MP3
		console.log('🔄 Preprocessing audio...');
		onStatus?.('🔄 Preprocessing audio...');
		const preprocessStartTime = Date.now();
		const audioBlob = await this.preprocess(blob);
		const preprocessTime = (Date.now() - preprocessStartTime) / 1000;
		const audioSizeMB = (audioBlob.size / 1024 / 1024).toFixed(2);
		console.log(`✅ Preprocessing completed, MP3 size: ${audioSizeMB}MB, time: ${preprocessTime.toFixed(2)}s`);

		console.log('🔄 Transcribing audio using Gemini with File API...');
		const transcriptionStartTime = Date.now();

		// Use @google/genai SDK
		const genai = new GoogleGenAI({ apiKey: settings.apiKey });

		// Upload audio to File API with retry
		console.log('📤 Uploading audio to Gemini File API...');
		onStatus?.('📤 Uploading audio...');
		const uploadStartTime = Date.now();
		const file = new File([audioBlob], `audio_${Date.now()}.mp3`, { type: 'audio/mpeg' });
		const uploadedFile = await this.withRetry(async () => {
			return await genai.files.upload({ file, config: { mimeType: 'audio/mpeg' } });
		});
		const uploadTime = (Date.now() - uploadStartTime) / 1000;
		console.log(`✅ Audio uploaded: ${uploadedFile.name}, time: ${uploadTime.toFixed(2)}s`);

		// Transcribe with retry support
		onStatus?.('📝 Transcribing...');
		let fullText = await this.withRetry(async () => {
			console.log(`⏳ Processing transcription...`);
			const processStartTime = Date.now();

			const response = await genai.models.generateContent({
				model: settings.model,
				contents: [
					{
						parts: [
							{ text: "Transcribe this audio. If the language is Chinese, please use Simplified Chinese characters. Provide only the direct transcription text without any introductory phrases." },
							createPartFromUri(uploadedFile.uri!, uploadedFile.mimeType!),
						],
					}
				],
				config: {
					temperature: settings.temperature,
					thinkingConfig: {
						thinkingLevel: settings.thinkingLevel,
					} as unknown as ThinkingConfig,
				},
			});

			const processTime = (Date.now() - processStartTime) / 1000;
			console.log(`✅ Transcription completed, time: ${processTime.toFixed(2)}s, text length: ${(response.text || '').length}`);

			return response.text || '';
		});

		const transcriptionTime = (Date.now() - transcriptionStartTime) / 1000;
		console.log(`✅ Gemini transcription completed, time: ${transcriptionTime.toFixed(2)}s`);

		// Clean up uploaded file
		console.log('🧹 Cleaning up uploaded file...');
		onStatus?.('🧹 Cleaning up...');
		try {
			await genai.files.delete({ name: uploadedFile.name! });
			console.log('✅ Uploaded file cleaned up');
		} catch {
			// Ignore cleanup errors
		}

		// Clean up repetitive characters
		console.log('🧹 Cleaning up repetitive characters...');
		const beforeCleanup = fullText.length;
		fullText = this.cleanupRepetitiveCharacters(fullText);
		const afterCleanup = fullText.length;
		const cleanupReduction = beforeCleanup - afterCleanup;
		if (cleanupReduction > 0) {
			console.log(`✅ Cleanup completed. Removed ${cleanupReduction} repetitive characters (${(cleanupReduction / beforeCleanup * 100).toFixed(1)}%)`);
		} else {
			console.log(`✅ Cleanup completed. No repetitive characters found.`);
		}

		const totalTime = (Date.now() - overallStartTime) / 1000;
		console.log(`🎉 Transcription process completed! Total time: ${totalTime.toFixed(2)}s`);

		return fullText;
	}

	// Generate silence audio for specified duration
	private generateSilence(sampleRate: number, durationSeconds: number): Float32Array {
		const samples = Math.floor(sampleRate * durationSeconds);
		return new Float32Array(samples); // All zeros, which means silence
	}

	// Preprocess audio: decode, resample to 16kHz mono, trim silence, convert to MP3
	private async preprocess(blob: Blob): Promise<Blob> {
		const TARGET_SAMPLE_RATE = 16000;
		const SILENCE_THRESHOLD = 0.01;
		const MIN_SILENCE_DURATION_SECONDS = 2;
		const MIN_SILENCE_TRIM_SAMPLES = Math.floor(MIN_SILENCE_DURATION_SECONDS * TARGET_SAMPLE_RATE);
		const REPLACEMENT_SILENCE_DURATION = 1; // Replace with 1 second silence

		const arrayBuffer = await blob.arrayBuffer();
		const AudioContextConstructor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioContextConstructor) {
			throw new Error("Web Audio API is not supported in this browser.");
		}
		const decodeCtx = new AudioContextConstructor();
		let originalBuffer: AudioBuffer;
		try {
			originalBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
		} finally {
			await decodeCtx.close();
		}

		const targetLength = Math.ceil(originalBuffer.duration * TARGET_SAMPLE_RATE);
		const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
		const source = offlineCtx.createBufferSource();

		if (originalBuffer.numberOfChannels > 1) {
			const numChannels = originalBuffer.numberOfChannels;
			const monoBuf = offlineCtx.createBuffer(1, originalBuffer.length, originalBuffer.sampleRate);
			const monoData = monoBuf.getChannelData(0);
			const channels = [];
			for (let c = 0; c < numChannels; c++) {
				channels.push(originalBuffer.getChannelData(c));
			}
			for (let i = 0; i < originalBuffer.length; i++) {
				let sum = 0;
				for (let c = 0; c < numChannels; c++) {
					sum += channels[c][i];
				}
				monoData[i] = sum / numChannels;
			}
			source.buffer = monoBuf;
		} else {
			source.buffer = originalBuffer;
		}
		source.connect(offlineCtx.destination);
		source.start();
		const resampled = await offlineCtx.startRendering();

		// Close the OfflineAudioContext to prevent memory leak
		const offlineCtxAny = offlineCtx as unknown as { state: string; close?: () => Promise<void> };
		if (offlineCtxAny.state !== 'closed' && typeof offlineCtxAny.close === 'function') {
			await offlineCtxAny.close();
		}

		// Silence processing: replace long silence with 1 second silence
		const rawData = resampled.getChannelData(0);
		const replacementSilence = this.generateSilence(TARGET_SAMPLE_RATE, REPLACEMENT_SILENCE_DURATION);

		// Calculate processed data length
		let processedLength = 0;
		let currentSilentCount = 0;
		let i = 0;

		while (i < rawData.length) {
			if (Math.abs(rawData[i]) <= SILENCE_THRESHOLD) {
				currentSilentCount++;
				i++;
			} else {
				if (currentSilentCount >= MIN_SILENCE_TRIM_SAMPLES) {
					processedLength += replacementSilence.length;
				} else {
					processedLength += currentSilentCount;
				}
				currentSilentCount = 0;
				processedLength++;
				i++;
			}
		}

		// Handle trailing silence
		if (currentSilentCount >= MIN_SILENCE_TRIM_SAMPLES) {
			processedLength += replacementSilence.length;
		} else {
			processedLength += currentSilentCount;
		}

		// Create processed data
		const data = new Float32Array(processedLength);
		let writeIndex = 0;
		currentSilentCount = 0;
		i = 0;

		while (i < rawData.length) {
			if (Math.abs(rawData[i]) <= SILENCE_THRESHOLD) {
				currentSilentCount++;
				i++;
			} else {
				if (currentSilentCount >= MIN_SILENCE_TRIM_SAMPLES) {
					for (let j = 0; j < replacementSilence.length; j++) {
						data[writeIndex++] = replacementSilence[j];
					}
				} else {
					for (let j = i - currentSilentCount; j < i; j++) {
						data[writeIndex++] = rawData[j];
					}
				}
				currentSilentCount = 0;
				data[writeIndex++] = rawData[i];
				i++;
			}
		}

		// Handle trailing silence
		if (currentSilentCount >= MIN_SILENCE_TRIM_SAMPLES) {
			for (let j = 0; j < replacementSilence.length; j++) {
				data[writeIndex++] = replacementSilence[j];
			}
		} else {
			for (let j = i - currentSilentCount; j < i; j++) {
				data[writeIndex++] = rawData[j];
			}
		}

		// Log duration info
		const originalDuration = originalBuffer.duration;
		const processedDuration = data.length / TARGET_SAMPLE_RATE;
		console.log(`🔄 Audio processed: ${originalDuration.toFixed(2)}s -> ${processedDuration.toFixed(2)}s (silence trimmed)`);

		// Convert to MP3
		const audioCtx = new AudioContextConstructor();
		const buffer = audioCtx.createBuffer(1, data.length, TARGET_SAMPLE_RATE);
		buffer.getChannelData(0).set(data);
		await audioCtx.close();

		return this.bufferToMp3(buffer);
	}

	private bufferToMp3(buffer: AudioBuffer): Blob {
		const sampleRate = buffer.sampleRate;
		const numChannels = 1; // We always use mono
		const kbps = 64; // MP3 bitrate (64kbps is sufficient for speech)

		// Convert Float32Array to Int16Array
		const channelData = buffer.getChannelData(0);
		const samples = new Int16Array(channelData.length);
		for (let i = 0; i < channelData.length; i++) {
			const s = Math.max(-1, Math.min(1, channelData[i]));
			samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
		}

		// Create MP3 encoder
		const mp3encoder = new Mp3Encoder(numChannels, sampleRate, kbps);
		const mp3Data: Uint8Array[] = [];

		// Encode in chunks of 1152 samples (MP3 frame size)
		const sampleBlockSize = 1152;
		for (let i = 0; i < samples.length; i += sampleBlockSize) {
			const sampleChunk = samples.subarray(i, i + sampleBlockSize);
			const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
			if (mp3buf.length > 0) {
				mp3Data.push(mp3buf);
			}
		}

		// Flush remaining data
		const mp3buf = mp3encoder.flush();
		if (mp3buf.length > 0) {
			mp3Data.push(mp3buf);
		}

		return new Blob(mp3Data, { type: 'audio/mp3' });
	}
}
