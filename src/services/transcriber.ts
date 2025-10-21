import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

// Utility class to limit concurrency
class ConcurrencyLimiter {
	private running = 0;
	private queue: Array<() => Promise<void>> = [];

	constructor(private limit: number) {}

	async run<T>(fn: () => Promise<T>): Promise<T> {
		return new Promise((resolve, reject) => {
			this.queue.push(async () => {
				try {
					this.running++;
					const result = await fn();
					resolve(result);
				} catch (error) {
					reject(error);
				} finally {
					this.running--;
					this.processQueue();
				}
			});
			this.processQueue();
		});
	}

	private processQueue() {
		if (this.running < this.limit && this.queue.length > 0) {
			const task = this.queue.shift();
			if (task) {
				task();
			}
		}
	}
}

export class TranscriberService {
	private async blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				if (typeof reader.result === 'string') {
					// reader.result is "data:audio/wav;base64,xxxxxx..."
					// We need to strip the "data:[<mediatype>][;base64]," part.
					const base64Data = reader.result.split(',')[1];
					if (base64Data) {
						resolve(base64Data);
					} else {
						reject(new Error('Failed to extract base64 data from blob string'));
					}
				} else {
					reject(new Error('Failed to read blob as base64 string: reader.result is not a string.'));
				}
			};
			reader.onerror = (error) => reject(new Error(`FileReader error: ${error}`));
			reader.readAsDataURL(blob);
		});
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
	 * Transcribe audio blob using OpenAI or Gemini API based on settings.
	 * @param blob Audio blob to transcribe
	 * @param settings TranscriberSettings from plugin configuration
	 */
	async transcribe(blob: Blob, settings: import('../settings/types').TranscriberSettings): Promise<string> {
		if (!settings.apiKey) {
			throw new Error('Transcriber API key is not configured');
		}

		console.log('🎵 Starting audio transcription processing...');
		const overallStartTime = Date.now();

		// Preprocess audio
		console.log('🔄 Preprocessing audio...');
		const preprocessStartTime = Date.now();
		const chunks = await this.preprocess(blob);
		const preprocessTime = (Date.now() - preprocessStartTime) / 1000;
		console.log(`✅ Preprocessing completed, generated ${chunks.length} audio chunks, time: ${preprocessTime.toFixed(2)}s`);

		const configuredLimit = Math.max(1, Math.floor(settings.concurrencyLimit ?? 6));
		// Create concurrency limiter with configured parallel requests
		const concurrencyLimiter = new ConcurrencyLimiter(configuredLimit);
		let fullText = '';

		// Handle OpenAI transcription
		if (settings.provider === 'openai') {
			console.log('🔄 Transcribing audio using OpenAI...');
			const transcriptionStartTime = Date.now();
			
			// Use OpenAI SDK for transcription
			const openai = new OpenAI({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
			
			// Process all chunks in parallel with index tracking
			const transcriptionPromises = chunks.map((chunk, index) =>
				concurrencyLimiter.run(async () => {
					console.log(`⏳ Processing chunk ${index + 1}/${chunks.length}...`);
					const chunkStartTime = Date.now();
					
					const transcription = await openai.audio.transcriptions.create({
						file: new File([chunk], `audio_chunk_${index}.wav`, { type: 'audio/wav' }),
						model: settings.model,
						response_format: 'text',
					});
					
					const chunkTime = (Date.now() - chunkStartTime) / 1000;
					console.log(`✅ Chunk ${index + 1} completed, time: ${chunkTime.toFixed(2)}s, text length: ${transcription.length}`);
					
					return { index, text: transcription };
				})
			);

			const results = await Promise.all(transcriptionPromises);
			
			// Sort by index to maintain order and join
			const sortedTranscriptions = results.sort((a, b) => a.index - b.index);
			fullText = sortedTranscriptions.map(r => r.text).join(' ');
			
			const transcriptionTime = (Date.now() - transcriptionStartTime) / 1000;
			console.log(`✅ OpenAI transcription completed, time: ${transcriptionTime.toFixed(2)}s`);
		}

		// Handle Gemini transcription
		if (settings.provider === 'gemini') {
			console.log('🔄 Transcribing audio using Gemini...');
			const transcriptionStartTime = Date.now();
			
			// Use @google/genai SDK
			const genai = new GoogleGenAI({ apiKey: settings.apiKey });

			// Process all chunks in parallel with index tracking
			const transcriptionPromises = chunks.map((chunk, index) =>
				concurrencyLimiter.run(async () => {
					console.log(`⏳ Processing chunk ${index + 1}/${chunks.length}...`);
					const chunkStartTime = Date.now();
					
					const base64Audio = await this.blobToBase64(chunk);
					
					const response = await genai.models.generateContent({
						model: settings.model,
						contents: [
							{
								parts: [
									{ text: "Transcribe this audio. If the language is Chinese, please use Simplified Chinese characters. Provide only the direct transcription text without any introductory phrases." },
									{ 
										inlineData: { 
											mimeType: 'audio/wav', 
											data: base64Audio 
										} 
									},
								],
							}
						],
					});
					
					const chunkTime = (Date.now() - chunkStartTime) / 1000;
					console.log(`✅ Chunk ${index + 1} completed, time: ${chunkTime.toFixed(2)}s, text length: ${(response.text || '').length}`);
					
					return { index, text: response.text || '' };
				})
			);

			const results = await Promise.all(transcriptionPromises);
			
			// Sort by index to maintain order and join
			const sortedTranscriptions = results.sort((a, b) => a.index - b.index);
			fullText = sortedTranscriptions.map(r => r.text).join(' ');
			
			const transcriptionTime = (Date.now() - transcriptionStartTime) / 1000;
			console.log(`✅ Gemini transcription completed, time: ${transcriptionTime.toFixed(2)}s`);
		}

		if (settings.provider !== 'openai' && settings.provider !== 'gemini') {
			throw new Error(`Unsupported transcription provider: ${settings.provider}`);
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

	// Preprocess audio: decode, resample to 16k mono and chunk into ≤5min WAV blobs
	private async preprocess(blob: Blob, maxSecsInput?: number): Promise<Blob[]> {
		const TARGET_SAMPLE_RATE = 16000;
		const MAX_CHUNK_SECONDS = maxSecsInput ?? 300; // 300 seconds (5 minutes)
		const OVERLAP_SECONDS = 2; // 2 seconds overlap to prevent sentence cutoff
		const OVERLAP_SAMPLES = Math.floor(OVERLAP_SECONDS * TARGET_SAMPLE_RATE);
		const SILENCE_THRESHOLD = 0.01;
		const MIN_SILENCE_DURATION_SECONDS = 2;
		const MIN_SILENCE_TRIM_SAMPLES = Math.floor(MIN_SILENCE_DURATION_SECONDS * TARGET_SAMPLE_RATE);
		const REPLACEMENT_SILENCE_DURATION = 1; // Replace with 1 second silence
		const MIN_CHUNK_DURATION_SECONDS = 2;
		const MIN_CHUNK_SAMPLES = Math.floor(MIN_CHUNK_DURATION_SECONDS * TARGET_SAMPLE_RATE);

		const arrayBuffer = await blob.arrayBuffer();
		const AudioContextConstructor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioContextConstructor) {
			throw new Error("Web Audio API is not supported in this browser.");
		}
		const decodeCtx = new AudioContextConstructor();
		const originalBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
		
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
		
		// Modified silence processing logic: replace long silence with 1 second silence instead of removing
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
					// Long silence: replace with 1 second silence
					processedLength += replacementSilence.length;
				} else {
					// Short silence: keep as is
					processedLength += currentSilentCount;
				}
				currentSilentCount = 0;
				processedLength++; // Current non-silent sample
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
					// Long silence: write 1 second silence
					for (let j = 0; j < replacementSilence.length; j++) {
						data[writeIndex++] = replacementSilence[j];
					}
				} else {
					// Short silence: write original silence
					for (let j = i - currentSilentCount; j < i; j++) {
						data[writeIndex++] = rawData[j];
					}
				}
				currentSilentCount = 0;
				data[writeIndex++] = rawData[i]; // Write current non-silent sample
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

		// Simple time-based chunking with overlap
		const maxSamples = MAX_CHUNK_SECONDS * TARGET_SAMPLE_RATE;
		const totalSamples = data.length;
		const totalDuration = totalSamples / TARGET_SAMPLE_RATE;
		const audioCtxForChunking = new AudioContextConstructor();
		const chunks: Blob[] = [];
		let chunkIndex = 0;
		
		console.log(`🔄 Splitting audio into chunks: ${totalDuration.toFixed(2)}s total, ${maxSamples} samples per chunk, ${OVERLAP_SECONDS}s overlap`);
		
		let startSample = 0;
		while (startSample < totalSamples) {
			// Calculate end sample for this chunk
			const endSample = Math.min(startSample + maxSamples, totalSamples);
			
			// For chunks after the first one, include overlap from previous chunk
			let chunkStartSample = startSample;
			if (chunkIndex > 0) {
				chunkStartSample = Math.max(0, startSample - OVERLAP_SAMPLES);
			}
			
			const segmentSamples = endSample - chunkStartSample;
			const segmentDurationSeconds = segmentSamples / TARGET_SAMPLE_RATE;
			
			// Only create chunk if it meets minimum duration
			if (segmentSamples >= MIN_CHUNK_SAMPLES) {
				const segmentBuf = audioCtxForChunking.createBuffer(1, segmentSamples, TARGET_SAMPLE_RATE);
				segmentBuf.getChannelData(0).set(data.subarray(chunkStartSample, endSample));
				chunks.push(this.bufferToWav(segmentBuf));
				
				const overlapInfo = chunkIndex > 0 ? ` (includes ${OVERLAP_SECONDS}s overlap)` : '';
				console.log(`📦 Created chunk ${chunkIndex + 1}: ${segmentDurationSeconds.toFixed(2)}s ${overlapInfo}`);
				chunkIndex++;
			} else {
				console.log(`⚠️ Skipping short chunk: ${segmentDurationSeconds.toFixed(2)}s (samples ${chunkStartSample}-${endSample})`);
			}
			
			// Move to next chunk position (without overlap for the start calculation)
			startSample = endSample;
		}
		
		console.log(`✅ Audio splitting completed: ${chunks.length} chunks created with ${OVERLAP_SECONDS}s overlap between chunks`);
		return chunks;
	}

	private bufferToWav(buffer: AudioBuffer): Blob {
		const numOfChannels = buffer.numberOfChannels;
		const sampleRate = buffer.sampleRate;
		const bitDepth = 16;
		const blockAlign = numOfChannels * (bitDepth / 8);
		const dataSize = buffer.length * blockAlign;
		const bufferArray = new ArrayBuffer(44 + dataSize);
		const view = new DataView(bufferArray);

		const writeString = (str: string, offset: number) => {
			for (let i = 0; i < str.length; i++) {
				view.setUint8(offset + i, str.charCodeAt(i));
			}
		};

		writeString('RIFF', 0);
		view.setUint32(4, 36 + dataSize, true);
		writeString('WAVE', 8);
		writeString('fmt ', 12);
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, numOfChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * blockAlign, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, bitDepth, true);
		writeString('data', 36);
		view.setUint32(40, dataSize, true);

		let offset = 44;
		const channelData = buffer.getChannelData(0);
		for (let i = 0; i < channelData.length; i++) {
			const s = Math.max(-1, Math.min(1, channelData[i]));
			view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
			offset += 2;
		}

		return new Blob([view], { type: 'audio/wav' });
	}
} 
