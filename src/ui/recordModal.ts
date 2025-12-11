import { App, Modal, Notice } from 'obsidian';
import ObsidianAITranscriber from '../../main';
import { RecorderService, RecordingResult } from '../services/recorder';
import { FileService } from '../services/file';
import { SystemPromptTemplateSelectionModal } from './SystemPromptTemplateSelectionModal';

export default class RecordModal extends Modal {
	private plugin: ObsidianAITranscriber;
	private recorder: RecorderService;
	private fileService: FileService;
	private isPaused = false;
	private timerEl: HTMLElement;
	private timerUpdateIntervalId: number;
	private animationFrameId: number | null = null;
	private recordBtn: HTMLElement;
	private pauseBtn: HTMLElement;
	private stopBtn: HTMLElement;
	private stopAndSaveBtn: HTMLElement;
	private canvasEl: HTMLCanvasElement;
	private canvasCtx: CanvasRenderingContext2D | null;

	constructor(app: App, plugin: ObsidianAITranscriber) {
		super(app);
		this.plugin = plugin;
		this.recorder = plugin.recorder;
		this.fileService = new FileService(this.app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ai-transcriber-record-modal');
		contentEl.createEl('h2', { text: 'Record Audio' });

		// Elapsed time display
		this.timerEl = contentEl.createEl('div', { cls: 'recorder-timer', text: '00:00' });

		// Waveform display
		this.canvasEl = contentEl.createEl('canvas', { cls: 'recorder-waveform' });
		this.canvasCtx = this.canvasEl.getContext('2d');
		this.setupCanvas();

		const buttonContainer = contentEl.createDiv({ cls: ['recorder-button-container', 'button-container'] });
		this.recordBtn = buttonContainer.createEl('button', { text: 'Record', cls: 'mod-cta' });
		this.pauseBtn = buttonContainer.createEl('button', { text: 'Pause' });
		this.pauseBtn.setAttr('disabled', 'true');
		this.stopAndSaveBtn = buttonContainer.createEl('button', { text: 'Stop & Save' });
		this.stopAndSaveBtn.setAttr('disabled', 'true');
		this.stopBtn = buttonContainer.createEl('button', { text: 'Stop & Transcribe' });
		this.stopBtn.setAttr('disabled', 'true');

		// Initialize UI and timer
		this.updateUI();
		this.timerUpdateIntervalId = window.setInterval(() => {
			const elapsed = this.recorder.getElapsed();
			this.timerEl.setText(this.formatTime(elapsed));
		}, 500);

		// Start visualization if already recording (e.g., modal reopened)
		if (this.recorder.isRecording() && !this.isPaused) {
			this.startVisualizationLoop();
		}

		this.recordBtn.onclick = async () => {
			try {
				// Start recording
				await this.recorder.start();
				this.plugin.updateStatus('🎤 Recording...');
				new Notice('Recording started');
				// Manually update button states immediately
				this.recordBtn.setAttr('disabled', 'true');
				this.pauseBtn.removeAttribute('disabled');
				this.stopBtn.removeAttribute('disabled');
				this.stopAndSaveBtn.removeAttribute('disabled');
				this.pauseBtn.setText('Pause');
				this.isPaused = false;
				this.startVisualizationLoop();
			} catch (error: unknown) {
				new Notice(`Error starting recording: ${(error as Error).message}`);
				console.error(error);
			}
		};

		this.pauseBtn.onclick = () => {
			if (!this.isPaused) {
				this.recorder.pause();
				this.plugin.updateStatus('⏸️ Recording Paused');
				this.pauseBtn.setText('Resume');
				this.isPaused = true;
				new Notice('Recording paused');
				this.stopVisualizationLoop();
				this.clearWaveformCanvas();
			} else {
				this.recorder.resume();
				this.plugin.updateStatus('🎤 Recording...');
				this.pauseBtn.setText('Pause');
				this.isPaused = false;
				new Notice('Recording resumed');
				this.startVisualizationLoop();
			}
		};

		this.stopBtn.onclick = async () => {
			this.stopVisualizationLoop();
			this.stopBtn.setAttr('disabled', 'true');
			this.stopAndSaveBtn.setAttr('disabled', 'true');
			this.pauseBtn.setAttr('disabled', 'true');
			new Notice('Stopping recording…');
			try {
				const result: RecordingResult = await this.recorder.stop();
				const audioDir = this.plugin.settings.transcriber.audioDir;
				const audioPath = await this.fileService.saveRecording(result.blob, audioDir);
				new Notice(`Recording saved to ${audioPath}`);

				const audioFileName = audioPath.substring(audioPath.lastIndexOf('/') + 1);
				const baseName = audioFileName.replace(/\.[^/.]+$/, '');

				if (this.plugin.settings.editor.enabled) {
					new SystemPromptTemplateSelectionModal(this.app, this.plugin, async (selectedTemplateName) => {
						if (!selectedTemplateName) {
							new Notice('Template selection cancelled. Audio saved, transcription aborted.');
							this.plugin.updateStatus('Transcriber Idle');
							this.close();
							return;
						}

						const selectedTemplate = this.plugin.settings.editor.systemPromptTemplates.find(t => t.name === selectedTemplateName);
						if (!selectedTemplate) {
							new Notice('Selected template not found. Audio saved, transcription aborted.');
							this.plugin.updateStatus('Transcriber Idle');
							this.close();
							return;
						}

						try {
							this.close();
							await this.plugin.processTranscription(result.blob, baseName, selectedTemplate.prompt);
						} catch (e) {
							new Notice(`Error during transcription/editing: ${(e as Error).message}`);
							console.error('Error during transcription/editing:', e);
						} finally {
							this.plugin.updateStatus('Transcriber Idle');
						}
					}).open();
				} else {
					try {
						await this.plugin.processTranscription(result.blob, baseName);
					} catch (e) {
						new Notice(`Error during transcription: ${(e as Error).message}`);
						console.error('Error during transcription:', e);
					} finally {
						this.plugin.updateStatus('Transcriber Idle');
						this.close();
					}
				}
			} catch (error: unknown) {
				new Notice(`Error: ${(error as Error).message}`);
				console.error(error);
				this.plugin.updateStatus('Transcriber Idle');
				this.close();
			}
		};

		// Handler for "Stop & Save" button
		this.stopAndSaveBtn.onclick = async () => {
			this.stopVisualizationLoop();
			this.stopAndSaveBtn.setAttr('disabled', 'true');
			this.stopBtn.setAttr('disabled', 'true');
			this.pauseBtn.setAttr('disabled', 'true');
			this.recordBtn.setAttr('disabled', 'true');
			this.plugin.updateStatus('💾 Saving recording...');
			new Notice('Saving recording...');
			try {
				const result: RecordingResult = await this.recorder.stop();
				const audioDir = this.plugin.settings.transcriber.audioDir;
				const audioPath = await this.fileService.saveRecording(result.blob, audioDir);
				new Notice(`Recording saved to ${audioPath}`);
				this.plugin.updateStatus('Transcriber Idle');
			} catch (error: unknown) {
				new Notice(`Error saving recording: ${(error as Error).message}`);
				console.error(error);
				this.plugin.updateStatus('Transcriber Idle');
			} finally {
				this.close();
			}
		};
	}

	onClose() {
		// Stop updating timer and waveform
		clearInterval(this.timerUpdateIntervalId);
		this.stopVisualizationLoop();
		this.contentEl.empty();
		// It's good practice to also clear the canvas context if it was used
		// This is now handled by stopVisualizationLoop or clearWaveformCanvas
	}

	private updateUI() {
		if (this.recorder.isPaused()) {
			// State: Paused
			this.recordBtn.setAttr('disabled', 'true');
			this.pauseBtn.removeAttribute('disabled');
			this.pauseBtn.setText('Resume');
			this.stopBtn.removeAttribute('disabled');
			this.stopAndSaveBtn.removeAttribute('disabled');
			this.isPaused = true; // Sync modal's local state
		} else if (this.recorder.isRecording()) {
			// State: Actively Recording (not paused)
			this.recordBtn.setAttr('disabled', 'true');
			this.pauseBtn.removeAttribute('disabled');
			this.pauseBtn.setText('Pause');
			this.stopBtn.removeAttribute('disabled');
			this.stopAndSaveBtn.removeAttribute('disabled');
			this.isPaused = false; // Sync modal's local state
		} else {
			// State: Stopped or not yet started
			this.recordBtn.removeAttribute('disabled');
			this.pauseBtn.setAttr('disabled', 'true');
			this.pauseBtn.setText('Pause'); // Default text for a non-active recording state
			this.stopBtn.setAttr('disabled', 'true');
			this.stopAndSaveBtn.setAttr('disabled', 'true');
			this.isPaused = false; // Sync modal's local state
		}
	}

	private formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	private setupCanvas() {
		if (!this.canvasCtx) return;
		// Set canvas dimensions - make it responsive or fixed with centering
		const containerWidth = this.contentEl.offsetWidth;
		this.canvasEl.width = containerWidth > 0 ? containerWidth * 0.8 : 300; // 80% of container or default
		this.canvasEl.height = 100; 
		
		// Style for centering
		this.canvasEl.style.display = 'block';
		this.canvasEl.style.margin = '15px auto';

		// Initial clear with theme background
		this.clearWaveformCanvas(true); // Pass true for initial setup color
	}
	
	private getThemeColor(variableName: string, fallbackColor: string): string {
		if (this.canvasEl && document.body.contains(this.canvasEl)) { // Ensure element is in DOM for getComputedStyle
			return getComputedStyle(this.canvasEl).getPropertyValue(variableName).trim() || fallbackColor;
		}
		return fallbackColor;
	}

	private clearWaveformCanvas(initialSetup = false) {
		if (this.canvasCtx) {
			// Use a less prominent background for idle/paused state, or initial setup
			const bgColor = initialSetup ? 
				this.getThemeColor('--background-secondary', 'rgb(200, 200, 200)') : 
				this.getThemeColor('--background-primary', 'rgb(220, 220, 220)');
			this.canvasCtx.fillStyle = bgColor;
			this.canvasCtx.fillRect(0, 0, this.canvasEl.width, this.canvasEl.height);
		}
	}
	
	private startVisualizationLoop(): void {
		if (this.animationFrameId === null && this.canvasCtx) {
			// Ensure analyser is available via recorder service
			if (this.recorder.getAnalyserNode()) {
				this.animationFrameId = requestAnimationFrame(this.visualizeAudio.bind(this));
			} else {
				console.warn("AnalyserNode not available, cannot start visualization.");
				this.clearWaveformCanvas();
			}
		}
	}

	private stopVisualizationLoop(): void {
		if (this.animationFrameId !== null) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = null;
			this.clearWaveformCanvas(); // Clear canvas when stopping
		}
	}

	private visualizeAudio() {
		if (!this.canvasCtx || !this.recorder.isRecording() || this.isPaused) {
			this.clearWaveformCanvas();
			// If loop was active, it will stop because new frame is not requested.
			// Explicitly nullify animationFrameId if we are stopping due to state change.
			if (this.animationFrameId !== null) {
					cancelAnimationFrame(this.animationFrameId);
					this.animationFrameId = null;
			}
			return;
		}

		const analyserNode = this.recorder.getAnalyserNode();
		if (!analyserNode) {
			this.clearWaveformCanvas();
			if (this.animationFrameId !== null) {
					cancelAnimationFrame(this.animationFrameId);
					this.animationFrameId = null;
			}
			return;
		}

		const bufferLength = analyserNode.frequencyBinCount;
		const dataArray = new Uint8Array(bufferLength);
		analyserNode.getByteTimeDomainData(dataArray);

		// Use theme colors for active recording
		const bgColor = this.getThemeColor('--background-secondary-alt', 'rgb(230, 230, 230)');
		const lineColor = this.getThemeColor('--text-accent', 'rgb(0, 122, 255)');

		this.canvasCtx.fillStyle = bgColor; 
		this.canvasCtx.fillRect(0, 0, this.canvasEl.width, this.canvasEl.height);
		this.canvasCtx.lineWidth = 2;
		this.canvasCtx.strokeStyle = lineColor;

		this.canvasCtx.beginPath();
		const sliceWidth = this.canvasEl.width * 1.0 / bufferLength;
		let x = 0;

		for (let i = 0; i < bufferLength; i++) {
			const v = dataArray[i] / 128.0; // Normalize data to 0-2 range
			const y = v * this.canvasEl.height / 2;

			if (i === 0) {
				this.canvasCtx.moveTo(x, y);
			} else {
				this.canvasCtx.lineTo(x, y);
			}
			x += sliceWidth;
		}

		this.canvasCtx.lineTo(this.canvasEl.width, this.canvasEl.height / 2);
		this.canvasCtx.stroke();
		
		// Request next frame if still active
		if (this.recorder.isRecording() && !this.isPaused) {
			this.animationFrameId = requestAnimationFrame(this.visualizeAudio.bind(this));
		} else {
			// If state changed to non-active during this frame, ensure loop is stopped.
			this.stopVisualizationLoop(); // This will also clear the canvas.
		}
	}
} 