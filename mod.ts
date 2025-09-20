import type {
  Handler,
  Middleware,
  MiddlewareOptions,
  RequestContext,
  RequestWithContext,
} from "./types.ts";

/**
 * This module contains functions to compose and manage middleware for Deno.serve.
 * It provides utilities to create middleware chains, handle errors, and share context.
 * @module
 */

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
 *   logger,
 *   cors(),
 *   auth("secret-token")
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
  return (req: Request, next) => {
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
 * const wrappedHandler = withMiddleware(logger, myHandler);
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
 *   .use(logger)
 *   .use(cors())
 *   .use(auth("token"))
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
   */
  use(middleware: Middleware): MiddlewareChain {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Sets options for the middleware chain.
   */
  configure(options: MiddlewareOptions): MiddlewareChain {
    this.options = { ...this.options, ...options };
    return this;
  }

  /**
   * Creates the final handler with the specified handler function.
   */
  handle(handler: Handler): Handler {
    return compose(this.middlewares, handler, this.options);
  }
}

/**
 * Creates a new middleware chain builder.
 */
export function createMiddlewareChain(): MiddlewareChain {
  return new MiddlewareChain();
}
