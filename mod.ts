/**
 * Comprehensive middleware collection for Deno web applications.
 * Provides utilities for middleware composition, logging, CORS, rate limiting, timeouts, and context management.
 * @module
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * A middleware function that processes a Request and can modify it or the Response.
 * It receives the Request and a `next` function to call the next middleware or handler.
 * This is compatible with Deno.serve handlers.
 */
export type Middleware = (
  req: Request,
  next: () => Promise<Response>
) => Promise<Response>;

/**
 * A handler function that processes an incoming Request and returns a Response.
 * This is the standard Deno.serve handler signature.
 */
export type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Configuration options for middleware composition.
 */
export interface MiddlewareOptions {
  /**
   * Whether to continue processing if an error occurs in middleware.
   * If false, errors will be caught and returned as 500 responses.
   */
  continueOnError?: boolean;

  /**
   * Default error handler for middleware errors.
   */
  errorHandler?: (error: Error, req: Request) => Response | Promise<Response>;
}

/**
 * Context object that can be attached to a request for sharing data between middleware.
 */
export interface RequestContext {
  [key: string]: unknown;
}

/**
 * Extended Request interface that includes a context property for middleware data sharing.
 */
export interface RequestWithContext extends Request {
  context?: RequestContext;
}

/**
 * Configuration options for the logger middleware.
 */
export interface LoggerOptions {
  /**
   * Whether to include request body in logs.
   */
  includeBody?: boolean;

  /**
   * Whether to include request headers in logs.
   */
  includeHeaders?: boolean;

  /**
   * Log format style.
   */
  format?: "simple" | "detailed" | "json";
}

/**
 * Configuration options for CORS middleware.
 */
export interface CorsOptions {
  /**
   * Allowed origins. Can be a string or array of strings.
   */
  origin?: string | string[];

  /**
   * Allowed HTTP methods.
   */
  methods?: string[];

  /**
   * Allowed headers.
   */
  headers?: string[];

  /**
   * Whether to allow credentials.
   */
  credentials?: boolean;

  /**
   * Max age for preflight cache in seconds.
   */
  maxAge?: number;
}

/**
 * Configuration options for rate limiting middleware.
 */
export interface RateLimitOptions {
  /**
   * Time window in milliseconds.
   */
  windowMs: number;

  /**
   * Maximum number of requests per window.
   */
  maxRequests: number;

  /**
   * Function to generate a unique key for rate limiting.
   */
  keyGenerator?: (req: Request) => string;

  /**
   * Whether to skip counting successful requests (2xx and 3xx).
   */
  skipSuccessfulRequests?: boolean;
}

// =============================================================================
// Core Middleware Composition
// =============================================================================

/**
 * Composes multiple middleware functions with a final handler to create a single handler
 * that's compatible with Deno.serve.
 *
 * @param middlewares Array of middleware functions to apply in order
 * @param handler Final handler to execute after all middleware
 * @param options Configuration options for middleware behavior
 * @returns A handler function compatible with Deno.serve
 *
 * @example
 * ```typescript
 * const handler = compose([
 *   logger(),
 *   cors(),
 *   rateLimit({ windowMs: 60000, maxRequests: 100 })
 * ], myAppHandler);
 *
 * Deno.serve({ port: 8000 }, handler);
 * ```
 */
export function compose(
  middlewares: Middleware[],
  handler: Handler,
  options: MiddlewareOptions = {}
): Handler {
  const { continueOnError = false, errorHandler = defaultErrorHandler } =
    options;

  return function composedHandler(req: Request): Promise<Response> {
    let index = -1;

    async function dispatch(i: number): Promise<Response> {
      if (i <= index) {
        throw new Error("next() called multiple times");
      }
      index = i;

      let fn: Middleware | Handler;

      if (i < middlewares.length) {
        fn = middlewares[i];
      } else if (i === middlewares.length) {
        fn = handler;
      } else {
        throw new Error("No handler found");
      }

      try {
        if (i === middlewares.length) {
          // Final handler - doesn't have a next function
          return await (fn as Handler)(req);
        } else {
          // Middleware - pass the next function
          return await (fn as Middleware)(req, () => dispatch(i + 1));
        }
      } catch (error) {
        if (continueOnError) {
          console.error("Middleware error:", error);
          return dispatch(i + 1);
        } else {
          return await errorHandler(error as Error, req);
        }
      }
    }

    return dispatch(0);
  };
}

/**
 * Default error handler that returns a 500 Internal Server Error response.
 */
function defaultErrorHandler(error: Error, _req: Request): Response {
  console.error("Unhandled middleware error:", error);
  return new Response(JSON.stringify({ error: "Internal Server Error" }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Creates a middleware that adds a context object to the request for data sharing.
 * This allows middleware to share data with each other and the final handler.
 *
 * @param initialContext Initial context data to add to the request
 * @returns Middleware function that adds context to the request
 *
 * @example
 * ```typescript
 * const contextMiddleware = withContext({ startTime: Date.now() });
 * ```
 */
export function withContext(initialContext: RequestContext = {}): Middleware {
  return (req: Request, next: () => Promise<Response>): Promise<Response> => {
    // Add context to the request object
    (req as RequestWithContext).context = { ...initialContext };
    return next();
  };
}

/**
 * Utility function to get context from a request.
 *
 * @param req The request object that may have context
 * @returns The context object or an empty object if none exists
 */
export function getContext(req: Request): RequestContext {
  return (req as RequestWithContext).context || {};
}

/**
 * Utility function to set a value in the request context.
 *
 * @param req The request object
 * @param key The context key
 * @param value The value to set
 */
export function setContext(req: Request, key: string, value: unknown): void {
  const context = getContext(req);
  context[key] = value;
  (req as RequestWithContext).context = context;
}

/**
 * Creates a middleware wrapper for Deno.serve that applies middleware to a handler.
 * This is an alternative to the compose function for simpler use cases.
 *
 * @param middleware Single middleware function to apply
 * @param handler Handler function to wrap
 * @returns Handler function compatible with Deno.serve
 *
 * @example
 * ```typescript
 * const wrappedHandler = withMiddleware(logger(), myHandler);
 * Deno.serve({ port: 8000 }, wrappedHandler);
 * ```
 */
export function withMiddleware(
  middleware: Middleware,
  handler: Handler
): Handler {
  return compose([middleware], handler);
}

/**
 * Creates a middleware chain builder for fluent middleware composition.
 *
 * @example
 * ```typescript
 * const handler = createMiddlewareChain()
 *   .use(logger())
 *   .use(cors())
 *   .use(rateLimit({ windowMs: 60000, maxRequests: 100 }))
 *   .handle(myAppHandler);
 *
 * Deno.serve({ port: 8000 }, handler);
 * ```
 */
export class MiddlewareChain {
  private middlewares: Middleware[] = [];
  private options: MiddlewareOptions = {};

  /**
   * Adds a middleware to the chain.
   *
   * @param middleware The middleware function to add
   * @returns The chain instance for method chaining
   */
  use(middleware: Middleware): MiddlewareChain {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Sets options for the middleware chain.
   *
   * @param options Configuration options for the middleware chain
   * @returns The chain instance for method chaining
   */
  configure(options: MiddlewareOptions): MiddlewareChain {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Creates the final handler with the specified handler function.
   *
   * @param handler The final handler function
   * @returns A composed handler function
   */
  handle(handler: Handler): Handler {
    return compose(this.middlewares, handler, this.options);
  }
}

/**
 * Creates a new middleware chain builder.
 *
 * @returns A new MiddlewareChain instance
 */
export function createMiddlewareChain(): MiddlewareChain {
  return new MiddlewareChain();
}

// =============================================================================
// Logger Middleware
// =============================================================================

/**
 * Logger middleware that logs HTTP requests and responses.
 *
 * @param options Logging configuration options
 * @returns Middleware function that logs requests
 *
 * @example
 * ```typescript
 * const loggerMiddleware = logger({
 *   includeBody: false,
 *   format: "detailed"
 * });
 * ```
 */
export function logger(options: LoggerOptions = {}): Middleware {
  const {
    includeBody = false,
    includeHeaders = false,
    format = "simple",
  } = options;

  return async (
    req: Request,
    next: () => Promise<Response>
  ): Promise<Response> => {
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
          `[${timestamp}] ${req.method} ${url.pathname}${url.search} -> ${
            response.status
          } (${duration.toFixed(2)}ms)`
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
          `${req.method} ${url.pathname} -> ${
            response.status
          } (${duration.toFixed(2)}ms)`
        );
        break;
    }

    return response;
  };
}

// =============================================================================
// CORS Middleware
// =============================================================================

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
export function cors(options: CorsOptions = {}): Middleware {
  const {
    origin = "*",
    methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    headers = ["Content-Type", "Authorization"],
    credentials = false,
    maxAge = 86400, // 24 hours
  } = options;

  return async (
    req: Request,
    next: () => Promise<Response>
  ): Promise<Response> => {
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

// =============================================================================
// Rate Limit Middleware
// =============================================================================

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
export function rateLimit(options: RateLimitOptions): Middleware {
  const {
    windowMs,
    maxRequests,
    keyGenerator = (req: Request): string => new URL(req.url).hostname,
    skipSuccessfulRequests = false,
  } = options;

  const clients = new Map<string, { count: number; resetTime: number }>();

  return async (
    req: Request,
    next: () => Promise<Response>
  ): Promise<Response> => {
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

// =============================================================================
// Timeout Middleware
// =============================================================================

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
  return async (
    _req: Request,
    next: () => Promise<Response>
  ): Promise<Response> => {
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
