import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { createClient } from '@/lib/supabase/server'
import { AddChildForm } from './add-child-form'

const GENDER_LABELS: Record<string, string> = {
  male: 'זכר',
  female: 'נקבה',
  other: 'אחר',
}

export default async function ChildrenPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requireUser()
  const relationship = await getRelationshipById(id)

  if (!relationship) {
    notFound()
  }

  if (relationship.status !== 'active') {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-4 px-4 py-8">
        <p className="text-zinc-700">ניתן לצפות בילדים רק לאחר שהקשר פעיל.</p>
      </main>
    )
  }

  const supabase = await createClient()
  const { data: children } = await supabase
    .from('children')
    .select('id, full_name, date_of_birth, gender, active')
    .eq('relationship_id', id)
    .order('created_at', { ascending: true })

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">ילדים</h1>

      {!children || children.length === 0 ? (
        <p className="text-zinc-600">אין עדיין ילדים רשומים.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {children.map((child) => (
            <li
              key={child.id}
              className="flex items-center justify-between rounded border border-zinc-200 p-3"
            >
              <div>
                <p className="font-medium">{child.full_name}</p>
                <p className="text-sm text-zinc-600">
                  {child.date_of_birth} · {GENDER_LABELS[child.gender] ?? child.gender}
                </p>
              </div>
              {!child.active && (
                <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs">לא פעיל/ה</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <AddChildForm relationshipId={id} />
    </main>
  )
}
