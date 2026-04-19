// Must be imported before `next` is required/imported in a custom server.
// Next.js 15's node-environment-baseline expects globalThis.AsyncLocalStorage
// to exist at compile time of its internal modules; when running under tsx
// with a custom server, the normal Next.js bootstrap that sets this up is
// bypassed and you get "Invariant: AsyncLocalStorage accessed in runtime
// where it is not available" the moment a route handler is compiled.
//
// See vercel/next.js#86719.
import { AsyncLocalStorage } from 'node:async_hooks';

const g = globalThis as unknown as { AsyncLocalStorage?: unknown };
if (typeof g.AsyncLocalStorage !== 'function') {
  g.AsyncLocalStorage = AsyncLocalStorage;
}
