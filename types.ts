/**
 * A middleware function that processes a Request and can modify it or the Response.
 * It receives the Request and a `next` function to call the next middleware or handler.
 * This is compatible with Deno.serve handlers.
 */
export type Middleware = (
  req: Request,
  next: () => Promise<Response>,
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
