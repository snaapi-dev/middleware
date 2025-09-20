import type { Middleware } from "./types.ts";

/**
 * Request timeout middleware that limits request processing time.
 *
 * @param timeoutMs Timeout in milliseconds
 * @returns Middleware function that enforces timeouts
 *
 * @example
 * ```typescript
 * const timeoutMiddleware = timeout(30000); // 30 seconds
 * ```
 */
export function timeout(timeoutMs: number): Middleware {
  return async (_req: Request, next) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      // Create a promise that rejects on timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () => {
          reject(new Error("Request timeout"));
        });
      });

      // Race the next middleware/handler against the timeout
      const response = await Promise.race([next(), timeoutPromise]);

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.message === "Request timeout") {
        return new Response(JSON.stringify({ error: "Request Timeout" }), {
          status: 408,
          headers: { "Content-Type": "application/json" },
        });
      }

      throw error;
    }
  };
}
