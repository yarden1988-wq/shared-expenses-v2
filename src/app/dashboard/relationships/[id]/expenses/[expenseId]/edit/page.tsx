import { notFound, redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/dal'
import {
  getExpenseById,
  getExpenseCategories,
  getActiveChildrenForRelationship,
  getDefaultSplitForRelationship,
} from '@/lib/expenses/data'
import { ExpenseForm } from '../../expense-form'

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string; expenseId: string }>
}) {
  const { id, expenseId } = await params
  const user = await requireUser()
  const expense = await getExpenseById(expenseId)

  if (!expense || expense.relationshipId !== id) {
    notFound()
  }

  if (expense.createdBy !== user.id) {
    redirect(`/dashboard/relationships/${id}/expenses/${expenseId}`)
  }

  if (expense.status !== 'draft' && expense.status !== 'changes_requested') {
    redirect(`/dashboard/relationships/${id}/expenses/${expenseId}`)
  }

  const [categories, availableChildren, defaultSplit] = await Promise.all([
    getExpenseCategories(),
    getActiveChildrenForRelationship(id),
    getDefaultSplitForRelationship(id),
  ])

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">עריכת הוצאה</h1>

      {expense.status === 'changes_requested' && expense.statusReason && (
        <div className="rounded border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <p className="font-medium">נדרשים שינויים:</p>
          <p>{expense.statusReason}</p>
        </div>
      )}

      <ExpenseForm
        mode="edit"
        relationshipId={id}
        expenseId={expenseId}
        categories={categories}
        availableChildren={availableChildren}
        defaultParentOnePercentage={defaultSplit?.parentOnePercentage ?? 50}
        defaultParentTwoPercentage={defaultSplit?.parentTwoPercentage ?? 50}
        initialReceiptPath={expense.receiptStoragePath}
        initialValues={{
          merchantName: expense.merchantName,
          expenseDate: expense.expenseDate,
          categoryId: expense.categoryId,
          items: expense.items.map((i) => ({
            description: i.description,
            amount: String(i.amount),
            included: i.isSelected,
          })),
          childIds: expense.children.map((c) => c.id),
          parentOnePercentage: expense.parentOnePercentage,
          parentTwoPercentage: expense.parentTwoPercentage,
        }}
      />
    </main>
  )
}
