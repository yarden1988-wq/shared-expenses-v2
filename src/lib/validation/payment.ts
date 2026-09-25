export type PaymentInput = {
  amount: string
  paymentDate: string
}

export type PaymentFieldErrors = {
  amount?: string
  paymentDate?: string
}

export function validatePaymentInput(input: PaymentInput): PaymentFieldErrors {
  const errors: PaymentFieldErrors = {}

  const amount = Number(input.amount)
  if (input.amount.trim() === '' || Number.isNaN(amount) || amount <= 0) {
    errors.amount = 'יש להזין סכום חיובי'
  }

  if (!input.paymentDate) {
    errors.paymentDate = 'שדה חובה'
  } else {
    const date = new Date(input.paymentDate)
    if (Number.isNaN(date.getTime())) {
      errors.paymentDate = 'תאריך לא תקין'
    } else if (date > new Date()) {
      errors.paymentDate = 'תאריך ההעברה לא יכול להיות בעתיד'
    }
  }

  return errors
}
