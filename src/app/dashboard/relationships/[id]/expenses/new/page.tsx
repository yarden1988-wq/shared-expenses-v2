import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import { getRelationshipById } from '@/lib/relationships/data'
import { getExpenseCategories, getActiveChildrenForRelationship, getDefaultSplitForRelationship } from '@/lib/expenses/data'
import { ExpenseForm } from '../expense-form'

export default async function NewExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requireUser()
  const relationship = await getRelationshipById(id)

  if (!relationship) {
    notFound()
  }

  if (relationship.status !== 'active') {
    redirect(`/dashboard/relationships/${id}`)
  }

  const [categories, availableChildren, defaultSplit] = await Promise.all([
    getExpenseCategories(),
    getActiveChildrenForRelationship(id),
    getDefaultSplitForRelationship(id),
  ])

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">הוצאה חדשה</h1>
      {!defaultSplit && (
        <p className="text-sm text-zinc-600">
          לא נמצאה חלוקת ברירת מחדל לקשר זה — יש להזין חלוקה ידנית להוצאה זו.
        </p>
      )}
      <ExpenseForm
        mode="create"
        relationshipId={id}
        categories={categories}
        availableChildren={availableChildren}
        defaultParentOnePercentage={defaultSplit?.parentOnePercentage ?? 50}
        defaultParentTwoPercentage={defaultSplit?.parentTwoPercentage ?? 50}
        forceOverrideSplit={!defaultSplit}
      />
    </main>
  )
}
