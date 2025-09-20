/**
 * Rate limiting middleware for controlling request frequency.
 * Implements time-window based rate limiting with configurable limits and key generation.
 * @module
 */

import type { Middleware } from "./types.ts";
/**
 * Rate limiting middleware that limits requests per time window.
 *
 * @param options Rate limiting configuration
 * @returns Middleware function that enforces rate limits
 *
 * @example
 * ```typescript
 * const rateLimitMiddleware = rateLimit({
 *   windowMs: 60000, // 1 minute
 *   maxRequests: 100
 * });
 * ```
 */
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}

export function rateLimit(options: RateLimitOptions): Middleware {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req) => new URL(req.url).hostname,
    skipSuccessfulRequests = false,
  } = options;

  const clients = new Map<string, { count: number; resetTime: number }>();

  return async (req: Request, next) => {
    const key = keyGenerator(req);
    const now = Date.now();

    const client = clients.get(key);

    if (!client || now > client.resetTime) {
      clients.set(key, { count: 1, resetTime: now + windowMs });
    } else {
      client.count++;

      if (client.count > maxRequests) {
        return new Response(
          JSON.stringify({
            error: "Too Many Requests",
            retryAfter: Math.ceil((client.resetTime - now) / 1000),
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": Math.ceil(
                (client.resetTime - now) / 1000
              ).toString(),
              "X-RateLimit-Limit": maxRequests.toString(),
              "X-RateLimit-Remaining": Math.max(
                0,
                maxRequests - client.count
              ).toString(),
              "X-RateLimit-Reset": client.resetTime.toString(),
            },
          }
        );
      }
    }

    const response = await next();

    // If skipSuccessfulRequests is true and response is successful, don't count this request
    if (skipSuccessfulRequests && response.status < 400) {
      const currentClient = clients.get(key);
      if (currentClient) {
        currentClient.count = Math.max(0, currentClient.count - 1);
      }
    }

    // Add rate limit headers to response
    const currentClient = clients.get(key);
    if (currentClient) {
      response.headers.set("X-RateLimit-Limit", maxRequests.toString());
      response.headers.set(
        "X-RateLimit-Remaining",
        Math.max(0, maxRequests - currentClient.count).toString()
      );
      response.headers.set(
        "X-RateLimit-Reset",
        currentClient.resetTime.toString()
      );
    }

    return response;
  };
}
