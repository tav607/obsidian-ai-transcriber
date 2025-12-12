import { fixWebmDuration } from "@fix-webm-duration/fix";

export interface RecordingResult {
	blob: Blob;
	duration: number; // seconds
	size: number; // bytes
}

export class RecorderService {
	private mediaRecorder: MediaRecorder | null = null;
	private recordedChunks: Blob[] = [];
	private startTime = 0;
	private pauseTime = 0;
	private totalPausedTime = 0;
	private finalElapsed: number | null = null;
	private resolveStop: ((result: RecordingResult) => void) | null = null;
	private rejectStop: ((reason?: unknown) => void) | null = null;
	private stopPromise: Promise<RecordingResult> | null = null;
	private stream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private analyserNode: AnalyserNode | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;

	constructor() {}

	// Detected MIME type for recording (set during init)
	private detectedMimeType: string = 'audio/webm;codecs=opus';

	public async init() {
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

		// Detect supported MIME type for cross-platform compatibility
		const mimeTypes = [
			'audio/webm;codecs=opus',
			'audio/webm',
			'audio/mp4',
			'audio/ogg;codecs=opus',
			'audio/ogg',
		];
		const supported = mimeTypes.find(t => MediaRecorder.isTypeSupported(t));
		if (!supported) {
			throw new Error('No supported audio recording format found on this device. Recording may not be available.');
		}
		this.detectedMimeType = supported;
		console.log(`🎤 Using audio format: ${supported}`);

		this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: supported });
		this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
			if (e.data.size > 0) {
				this.recordedChunks.push(e.data);
			}
		};

		// Initialize AudioContext and AnalyserNode for visualization
		const AudioContextConstructor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (AudioContextConstructor) {
			this.audioContext = new AudioContextConstructor();
			this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
			this.analyserNode = this.audioContext.createAnalyser();
			this.analyserNode.fftSize = 64; // Smaller FFT size for basic waveform
			this.sourceNode.connect(this.analyserNode);
			// Note: We don't connect analyserNode to destination, as we only want to analyze, not playback through it.
		} else {
			console.warn('Web Audio API not supported, waveform visualization disabled.');
		}
	}

	async start(): Promise<void> {
		if (!this.mediaRecorder) {
			await this.init();
		}
		this.recordedChunks = [];
		this.totalPausedTime = 0;
		this.startTime = Date.now();
		if (this.mediaRecorder) {
			this.mediaRecorder.start();
		}
		// Prepare promise for stop() to return recording result
		this.stopPromise = new Promise<RecordingResult>((resolve, reject) => {
			this.resolveStop = resolve;
			this.rejectStop = reject;
			if (this.mediaRecorder) {
				this.mediaRecorder.onstop = async () => {
					const rawBlob = new Blob(this.recordedChunks, { type: this.detectedMimeType });
					const durationMs = Date.now() - this.startTime - this.totalPausedTime;
					const duration = durationMs / 1000;
					// Fix webm duration metadata for proper seeking support (only for webm format)
					let blob: Blob;
					if (this.detectedMimeType.startsWith('audio/webm')) {
						try {
							blob = await fixWebmDuration(rawBlob, durationMs, { logger: false });
						} catch (e) {
							console.warn('Failed to fix webm duration, using raw blob:', e);
							blob = rawBlob;
						}
					} else {
						blob = rawBlob;
					}
					const size = blob.size;
					resolve({ blob, duration, size });
				};
			}
		});
		// Return immediately once recording has started
		return;
	}

	pause(): void {
		if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
			this.mediaRecorder.pause();
			this.pauseTime = Date.now();
		}
	}

	resume(): void {
		if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
			this.mediaRecorder.resume();
			this.totalPausedTime += Date.now() - this.pauseTime;
		}
	}

	async stop(): Promise<RecordingResult> {
		// Defensive check: if stop() is called before start(), return empty result
		if (!this.stopPromise) {
			return { blob: new Blob(), duration: 0, size: 0 };
		}

		// Store final elapsed time before stopping
		this.finalElapsed = this.getElapsed();

		// Stop the media recorder first to finalize the blob
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			this.mediaRecorder.stop();
		}
		// Wait for recording result (including webm duration fix)
		const result = await this.stopPromise;

		// Now clean up stream and audio context after blob is finalized
		if (this.stream) {
			this.stream.getTracks().forEach(track => track.stop());
		}

		// Disconnect and clean up audio context nodes
		if (this.sourceNode) {
			this.sourceNode.disconnect();
			this.sourceNode = null;
		}
		if (this.analyserNode) {
			this.analyserNode = null; // No disconnect method for AnalyserNode itself, just dereference
		}
		if (this.audioContext && this.audioContext.state !== 'closed') {
			await this.audioContext.close();
			this.audioContext = null;
		}

		// Reset recorder and stream for next recording
		this.mediaRecorder = null;
		this.stream = null;
		// Reset timing state and promise
		this.startTime = 0;
		this.pauseTime = 0;
		this.totalPausedTime = 0;
		this.finalElapsed = null;
		this.stopPromise = null;
		return result;
	}

	public isRecording(): boolean {
		return this.mediaRecorder?.state === 'recording';
	}

	public isPaused(): boolean {
		return this.mediaRecorder?.state === 'paused';
	}

	public getElapsed(): number {
		// If recording has been stopped, return the final elapsed time
		if (this.finalElapsed !== null) {
			return this.finalElapsed;
		}
		if (!this.startTime) return 0;
		if (this.mediaRecorder?.state === 'paused') {
			return (this.pauseTime - this.startTime - this.totalPausedTime) / 1000;
		}
		return (Date.now() - this.startTime - this.totalPausedTime) / 1000;
	}

	public getAnalyserNode(): AnalyserNode | null {
		return this.analyserNode;
	}
} 