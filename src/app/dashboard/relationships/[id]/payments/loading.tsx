import { Skeleton } from '@/components/ui/Skeleton'

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8" aria-busy="true">
      <Skeleton className="h-8 w-32" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </main>
  )
}
