/**
 * Retry a function with exponential backoff.
 * Used for network requests that may fail transiently.
 *
 * @example
 * const data = await withRetry(() => supabase.from('posts').select('*'), { maxRetries: 3 })
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number
    baseDelayMs?: number
    maxDelayMs?: number
    shouldRetry?: (error: unknown, attempt: number) => boolean
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    shouldRetry = () => true,
  } = options

  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
        throw error
      }

      // Exponential backoff with jitter
      const delay = Math.min(
        baseDelayMs * Math.pow(2, attempt) + Math.random() * 500,
        maxDelayMs,
      )
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

/**
 * Check if an error is a network/timeout error (worth retrying).
 * Don't retry auth errors (401) or validation errors (400).
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError && error.message === 'Network request failed') {
    return true
  }
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    // Retry 5xx server errors and 429 rate limits, but not 4xx client errors
    return status >= 500 || status === 429
  }
  return false
}
