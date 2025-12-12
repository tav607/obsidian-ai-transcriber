import { App, normalizePath, TFile } from 'obsidian';

export class FileService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Generate timestamped filename with given extension
	 */
	private getTimestampName(ext: string): string {
		const now = new Date();
		const yyyy = now.getFullYear();
		const MM = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		const ss = String(now.getSeconds()).padStart(2, '0');
		return `${yyyy}${MM}${dd}_${hh}${mm}${ss}.${ext}`;
	}

	/**
	 * Normalize directory path and ensure the folder exists
	 */
	private async ensureFolder(dir: string): Promise<string> {
		const folder = dir ? dir.replace(/\\/g, '/').replace(/\/$/, '') : '';
		if (folder) {
			const folderPath = normalizePath(folder);
			const folderFile = this.app.vault.getAbstractFileByPath(folderPath);
			if (!folderFile) {
				await this.app.vault.createFolder(folderPath);
			}
		}
		return folder;
	}

	async saveRecording(blob: Blob, dir: string): Promise<string> {
		const ext = 'webm';
		const fileName = this.getTimestampName(ext);
		const folder = await this.ensureFolder(dir);
		const path = normalizePath(folder ? `${folder}/${fileName}` : fileName);
		const arrayBuffer = await blob.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		await this.app.vault.createBinary(path, uint8Array);
		return path;
	}

	/**
	 * Generate a unique file path by appending _2, _3, etc. if the file already exists.
	 */
	private getUniqueFilePath(folder: string, fileName: string): string {
		const basePath = normalizePath(folder ? `${folder}/${fileName}` : fileName);

		// Check if file exists
		if (!this.app.vault.getAbstractFileByPath(basePath)) {
			return basePath;
		}

		// Split filename into name and extension
		const lastDotIndex = fileName.lastIndexOf('.');
		const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
		const ext = lastDotIndex > 0 ? fileName.substring(lastDotIndex) : '';

		// Find unique name with suffix _2, _3, etc.
		let counter = 2;
		let newPath: string;
		do {
			const newFileName = `${nameWithoutExt}_${counter}${ext}`;
			newPath = normalizePath(folder ? `${folder}/${newFileName}` : newFileName);
			counter++;
		} while (this.app.vault.getAbstractFileByPath(newPath));

		return newPath;
	}

	/**
	 * Save a text file using a custom filename (including extension).
	 * If the file already exists, a suffix (_2, _3, etc.) will be added to avoid overwriting.
	 */
	async saveTextWithName(text: string, dir: string, fileName: string): Promise<string> {
		const folder = await this.ensureFolder(dir);
		const path = this.getUniqueFilePath(folder, fileName);
		await this.app.vault.create(path, text);
		return path;
	}

	// Add a method to open a file in the workspace
	async openFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(true).openFile(file);
		}
	}
}