import { Card } from './Card'

export type BalanceDirection = 'owed_to_me' | 'i_owe' | 'settled'

export function BalanceCard({
  direction,
  netAmount,
  counterpartName,
}: {
  direction: BalanceDirection
  netAmount: number
  counterpartName: string
}) {
  return (
    <Card className="flex flex-col items-center gap-1 py-6 text-center">
      {direction === 'settled' && (
        <>
          <p className="text-xl font-semibold text-foreground">מאוזן</p>
          <p className="text-sm text-muted">אין יתרה פתוחה מול {counterpartName}</p>
        </>
      )}
      {direction === 'owed_to_me' && (
        <>
          <p className="text-xl font-semibold text-[var(--color-success)]">חייבים לך</p>
          <p className="text-2xl font-bold text-[var(--color-success)]">{netAmount.toFixed(2)} ₪</p>
          <p className="text-sm text-muted">מאת {counterpartName}</p>
        </>
      )}
      {direction === 'i_owe' && (
        <>
          <p className="text-xl font-semibold text-[var(--color-danger)]">את/ה חייב/ת</p>
          <p className="text-2xl font-bold text-[var(--color-danger)]">{netAmount.toFixed(2)} ₪</p>
          <p className="text-sm text-muted">ל{counterpartName}</p>
        </>
      )}
    </Card>
  )
}
