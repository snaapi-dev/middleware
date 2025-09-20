/**
 * CORS (Cross-Origin Resource Sharing) middleware.
 * Handles preflight requests and adds appropriate CORS headers to responses.
 * @module
 */

import type { Middleware } from "./types.ts";

/**
 * CORS middleware that adds Cross-Origin Resource Sharing headers.
 *
 * @param options CORS configuration options
 * @returns Middleware function that adds CORS headers
 *
 * @example
 * ```typescript
 * const corsMiddleware = cors({
 *   origin: "*",
 *   methods: ["GET", "POST", "PUT", "DELETE"],
 *   headers: ["Content-Type", "Authorization"]
 * });
 * ```
 */
export interface CorsOptions {
  origin?: string | string[];
  methods?: string[];
  headers?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export function cors(options: CorsOptions = {}): Middleware {
  const {
    origin = "*",
    methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    headers = ["Content-Type", "Authorization"],
    credentials = false,
    maxAge = 86400, // 24 hours
  } = options;

  return async (req: Request, next) => {
    // Handle preflight requests
    if (req.method === "OPTIONS") {
      const response = new Response(null, { status: 204 });

      // Set CORS headers
      if (typeof origin === "string") {
        response.headers.set("Access-Control-Allow-Origin", origin);
      } else if (Array.isArray(origin)) {
        const requestOrigin = req.headers.get("Origin");
        if (requestOrigin && origin.includes(requestOrigin)) {
          response.headers.set("Access-Control-Allow-Origin", requestOrigin);
        }
      }

      response.headers.set("Access-Control-Allow-Methods", methods.join(", "));
      response.headers.set("Access-Control-Allow-Headers", headers.join(", "));
      response.headers.set("Access-Control-Max-Age", maxAge.toString());

      if (credentials) {
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }

      return response;
    }

    // Process the request
    const response = await next();

    // Add CORS headers to the response
    if (typeof origin === "string") {
      response.headers.set("Access-Control-Allow-Origin", origin);
    } else if (Array.isArray(origin)) {
      const requestOrigin = req.headers.get("Origin");
      if (requestOrigin && origin.includes(requestOrigin)) {
        response.headers.set("Access-Control-Allow-Origin", requestOrigin);
      }
    }

    if (credentials) {
      response.headers.set("Access-Control-Allow-Credentials", "true");
    }

    return response;
  };
}
