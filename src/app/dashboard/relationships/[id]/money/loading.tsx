export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8" aria-busy="true">
      <div className="h-8 w-32 animate-pulse rounded bg-zinc-200" />
      <div className="h-28 animate-pulse rounded bg-zinc-100" />
      <div className="flex gap-2">
        <div className="h-10 flex-1 animate-pulse rounded bg-zinc-100" />
        <div className="h-10 flex-1 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-10 animate-pulse rounded bg-zinc-100" />
        <div className="h-10 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="flex flex-col gap-2">
        <div className="h-10 animate-pulse rounded bg-zinc-100" />
        <div className="h-10 animate-pulse rounded bg-zinc-100" />
      </div>
    </main>
  )
}
