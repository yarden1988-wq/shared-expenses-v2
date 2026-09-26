// Minimal Deno globals for `npm run typecheck:functions` (tsc under Node).
// Not used at runtime: the Edge runtime provides the real Deno namespace.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (req: Request) => Response | Promise<Response>): void
}
