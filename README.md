# Deno.serve Compatible Middleware System

This middleware system provides a flexible and powerful way to compose
middleware functions that are fully compatible with `Deno.serve` handlers.

## Features

- 🔄 **Full Deno.serve compatibility** - Works seamlessly with standard Deno
  HTTP handlers
- 🛠️ **Flexible composition** - Multiple ways to compose middleware (functional
  and fluent)
- 🔧 **Built-in middleware** - Common middleware like CORS, logging, auth, rate
  limiting
- 🚨 **Error handling** - Configurable error handling and recovery
- 📊 **Request context** - Share data between middleware and handlers
- ⚡ **Type-safe** - Full TypeScript support with proper typing

## Quick Start

### Basic Usage

```typescript
import { 
  createMiddlewareChain,
  logger,
  cors,
  rateLimit,
  timeout
} from "jsr:@snaapi/middleware";

// Your application handler
function myHandler(req: Request): Response {
  return new Response("Hello World!");
}

// Create middleware stack
const handler = createMiddlewareChain()
  .use(logger())
  .use(cors())
  .use(rateLimit({ windowMs: 60000, maxRequests: 100 }))
  .use(timeout(30000))
  .handle(myHandler);

// Start server
Deno.serve({ port: 8000 }, handler);
```

### Alternative Composition

```typescript
import { 
  compose,
  logger,
  cors,
  rateLimit,
  timeout
} from "jsr:@snaapi/middleware";

const handler = compose(
  [
    logger(),
    cors(),
    rateLimit({ windowMs: 60000, maxRequests: 100 }),
    timeout(30000),
  ],
  myHandler,
);

Deno.serve({ port: 8000 }, handler);
```

## Built-in Middleware

### Logger

Logs HTTP requests with configurable formats:

```typescript
import { logger } from "jsr:@snaapi/middleware";

// Simple logging
.use(logger())

// Detailed logging with headers and body
.use(logger({ 
  format: "detailed",
  includeHeaders: true,
  includeBody: true 
}))

// JSON structured logging
.use(logger({ format: "json" }))
```

### CORS

Handles Cross-Origin Resource Sharing:

```typescript
import { cors } from "jsr:@snaapi/middleware";

// Basic CORS (allows all origins)
.use(cors())

// Configured CORS
.use(cors({
  origin: ["https://myapp.com", "https://admin.myapp.com"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  headers: ["Content-Type", "Authorization"],
  credentials: true
}))
```

### Rate Limiting

Request rate limiting per client:

```typescript
import { rateLimit } from "jsr:@snaapi/middleware";

// 100 requests per minute
.use(rateLimit({
  windowMs: 60000,
  maxRequests: 100
}))

// Custom key generator (rate limit by IP)
.use(rateLimit({
  windowMs: 60000,
  maxRequests: 100,
  keyGenerator: (req) => req.headers.get("X-Real-IP") || "unknown"
}))
```



### Request Timeout

Timeout long-running requests:

```typescript
import { timeout } from "jsr:@snaapi/middleware";

// 30 second timeout
.use(timeout(30000))
```

## Custom Middleware

Create your own middleware functions:

```typescript
import { type Middleware } from "jsr:@snaapi/middleware";

// Simple custom middleware
const customMiddleware: Middleware = async (req, next) => {
  console.log(`Processing ${req.method} ${req.url}`);

  const response = await next();

  console.log(`Responded with ${response.status}`);
  return response;
};

// Middleware with configuration
function customAuth(apiKey: string): Middleware {
  return async (req, next) => {
    const key = req.headers.get("X-API-Key");

    if (key !== apiKey) {
      return new Response("Unauthorized", { status: 401 });
    }

    return next();
  };
}
```

## Request Context

Share data between middleware:

```typescript
import { withContext, getContext, setContext } from "jsr:@snaapi/middleware";

// Add context middleware
.use(withContext({ startTime: Date.now() }))

// Use context in subsequent middleware
.use(async (req, next) => {
  const context = getContext(req);
  console.log("Request started at:", context.startTime);
  
  setContext(req, "userId", "user123");
  
  return next();
})
```

## Error Handling

Configure error handling behavior:

```typescript
createMiddlewareChain()
  .use(logger())
  .use(cors())
  .configure({
    continueOnError: false,
    errorHandler: (error, req) => {
      console.error(`Error in ${req.url}:`, error);
      return new Response(
        JSON.stringify({ error: "Something went wrong" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    },
  })
  .handle(myHandler);
```

## Integration with Existing Code

### Using with ResourceHandler

```typescript
import { ResourceHandler } from "./server/resource.ts";
import { 
  createMiddlewareChain,
  logger,
  cors,
  rateLimit
} from "jsr:@snaapi/middleware";

const resourceHandler = new ResourceHandler();

const handler = createMiddlewareChain()
  .use(logger())
  .use(cors())
  .use(rateLimit({ windowMs: 60000, maxRequests: 100 }))
  .handle(resourceHandler.handler.bind(resourceHandler));

Deno.serve({ port: 8000 }, handler);
```

### Conditional Middleware

Apply different middleware to different routes:

```typescript
const handler = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    // Minimal middleware for health check
    return createMiddlewareChain()
      .use(logger({ format: "simple" }))
      .handle(healthHandler)(req);
  }

  // Full middleware stack for API routes
  return createMiddlewareChain()
    .use(logger({ format: "detailed" }))
    .use(cors())
    .use(auth("my-token"))
    .handle(apiHandler)(req);
};
```

## Type Definitions

### Middleware

```typescript
type Middleware = (
  req: Request,
  next: () => Promise<Response>,
) => Promise<Response>;
```

### Handler

```typescript
type Handler = (req: Request) => Response | Promise<Response>;
```

### Request Context

```typescript
interface RequestContext {
  [key: string]: unknown;
}
```

## Migration from Existing Code

To migrate existing code:

1. Replace direct `Deno.serve(handler)` calls with middleware-wrapped handlers
2. Move authentication logic to `auth()` middleware
3. Replace manual CORS handling with `cors()` middleware
4. Add logging with `logger()` middleware
5. Configure error handling with `.configure()`

### Before

```typescript
Deno.serve({ port: 8000 }, resourceHandler.handler.bind(resourceHandler));
```

### After

```typescript
const handler = createMiddlewareChain()
  .use(logger())
  .use(cors())
  .use(rateLimit({ windowMs: 60000, maxRequests: 100 }))
  .handle(resourceHandler.handler.bind(resourceHandler));

Deno.serve({ port: 8000 }, handler);
```
