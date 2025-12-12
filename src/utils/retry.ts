/**
 * Retry a function with exponential backoff.
 * @param fn The async function to retry
 * @param maxAttempts Maximum number of attempts (default: 3)
 * @param baseDelayMs Base delay in milliseconds (default: 1000)
 * @param context Context string for log messages (default: 'Operation')
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	maxAttempts = 3,
	baseDelayMs = 1000,
	context = 'Operation'
): Promise<T> {
	let lastError: Error | null = null;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error as Error;
			if (attempt < maxAttempts) {
				const delay = baseDelayMs * Math.pow(2, attempt - 1);
				console.warn(`⚠️ ${context} failed (attempt ${attempt}/${maxAttempts}): ${lastError.message}. Retrying in ${delay}ms...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}
	}
	throw new Error(`${context} failed after ${maxAttempts} attempts: ${lastError?.message}`);
}
