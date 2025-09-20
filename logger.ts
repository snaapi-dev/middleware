import type { Middleware } from "./types.ts";
import { setContext } from "./mod.ts";
/**
 * Logger middleware that logs HTTP requests and responses.
 *
 * @param options Logging configuration options
 * @returns Middleware function that logs requests
 *
 * @example
 * ```typescript
 * const loggerMiddleware = logger({ includeBody: false });
 * ```
 */
export interface LoggerOptions {
  includeBody?: boolean;
  includeHeaders?: boolean;
  format?: "simple" | "detailed" | "json";
}

export function logger(options: LoggerOptions = {}): Middleware {
  const {
    includeBody = false,
    includeHeaders = false,
    format = "simple",
  } = options;

  return async (req: Request, next) => {
    const start = performance.now();
    const timestamp = new Date().toISOString();

    // Store start time in context
    setContext(req, "startTime", start);

    let requestBody: string | undefined;
    if (includeBody && req.body) {
      try {
        const clonedRequest = req.clone();
        requestBody = await clonedRequest.text();
      } catch {
        requestBody = "[Unable to read body]";
      }
    }

    const response = await next();
    const duration = performance.now() - start;

    const url = new URL(req.url);
    const logData = {
      timestamp,
      method: req.method,
      path: url.pathname,
      query: url.search,
      status: response.status,
      duration: `${duration.toFixed(2)}ms`,
      userAgent: req.headers.get("User-Agent"),
      ...(includeHeaders && {
        headers: Object.fromEntries(req.headers.entries()),
      }),
      ...(requestBody && { requestBody }),
    };

    switch (format) {
      case "json":
        console.log(JSON.stringify(logData));
        break;
      case "detailed":
        console.log(
          `[${timestamp}] ${req.method} ${url.pathname}${url.search} -> ${response.status} (${
            duration.toFixed(2)
          }ms)`,
        );
        if (includeHeaders) {
          console.log("Headers:", Object.fromEntries(req.headers.entries()));
        }
        if (requestBody) {
          console.log("Body:", requestBody);
        }
        break;
      case "simple":
      default:
        console.log(
          `${req.method} ${url.pathname} -> ${response.status} (${
            duration.toFixed(2)
          }ms)`,
        );
        break;
    }

    return response;
  };
}
