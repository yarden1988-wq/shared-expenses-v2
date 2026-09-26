// Postgres RPC exceptions surface through supabase-js as a PostgrestError
// whose `.message` is exactly the string passed to `raise exception`. This
// maps every known code from the expenses migration to Hebrew; anything
// unrecognized falls back to a generic message rather than leaking a raw
// Postgres error string.

const GENERIC_MESSAGE = 'אירעה שגיאה. נסו שוב מאוחר יותר.'

const RPC_ERROR_MESSAGES: Partial<Record<string, string>> = {
  not_authenticated: 'יש להתחבר כדי לבצע פעולה זו.',
  not_relationship_participant: 'אין לך גישה לקשר זה.',
  not_relationship_member: 'רק צד לקשר יכול לבצע פעולה זו.',
  relationship_not_found: 'הקשר לא נמצא.',
  relationship_not_active: 'ניתן לבצע פעולה זו רק כאשר הקשר פעיל.',
  relationship_missing_active_revision: 'לא נמצאה חלוקת ברירת מחדל לקשר זה. יש להזין חלוקה ידנית.',
  invalid_merchant_name: 'יש להזין שם עסק תקין.',
  invalid_expense_date: 'תאריך ההוצאה אינו תקין.',
  invalid_category: 'יש לבחור קטגוריה תקינה.',
  children_required: 'יש לבחור לפחות ילד/ה אחד/ת.',
  invalid_child_reference: 'אחד הילדים שנבחרו אינו שייך לקשר זה.',
  items_required: 'יש להוסיף לפחות פריט אחד.',
  item_description_required: 'יש להזין תיאור לכל פריט.',
  item_amount_invalid: 'יש להזין סכום חיובי לכל פריט.',
  invalid_split_ratio: 'החלוקה חייבת להסתכם ב-100%.',
  invalid_receipt_storage_path: 'נתיב הקבלה אינו תקין.',
  receipt_not_found: 'הקבלה לא נמצאה. יש לצרף אותה מחדש.',
  receipt_already_attached: 'קבלה זו כבר מצורפת להוצאה אחרת. יש לצרף קובץ חדש.',
  expense_not_found: 'ההוצאה לא נמצאה.',
  not_expense_owner: 'רק מי שיצר/ה את ההוצאה יכול/ה לערוך אותה.',
  expense_not_editable: 'לא ניתן לערוך הוצאה זו במצבה הנוכחי.',
  expense_not_draft: 'ניתן לשלוח לאישור רק הוצאה שהיא טיוטה.',
  no_items_included: 'יש לכלול לפחות פריט אחד בסכום ההוצאה.',
  cannot_approve_own_expense: 'לא ניתן לאשר הוצאה שיצרת בעצמך.',
  cannot_reject_own_expense: 'לא ניתן לדחות הוצאה שיצרת בעצמך.',
  cannot_request_changes_on_own_expense: 'לא ניתן לבקש שינויים בהוצאה שיצרת בעצמך.',
  expense_not_submitted: 'ניתן לבצע פעולה זו רק על הוצאה הממתינה לאישור.',
  expense_not_rejectable: 'לא ניתן לדחות הוצאה זו במצבה הנוכחי.',
  invalid_item_reference: 'אחד הפריטים שנבחרו אינו שייך להוצאה זו.',
  no_items_approved: 'יש לאשר לפחות פריט אחד.',
  relationship_members_incomplete: 'לא ניתן להשלים את הפעולה עקב בעיה במבנה הקשר. יש לפנות לתמיכה.',
  reason_required: 'יש לציין סיבה.',
}

export function mapExpenseErrorToHebrew(
  error: { message?: string; code?: string } | null | undefined
): string {
  // Lost race on the one-expense-per-receipt unique index (see
  // 20260926000000_validate_receipt_storage_path.sql): a raw 23505, not
  // one of our codes, so match on SQLSTATE + index name.
  if (error?.code === '23505' && error.message?.includes('expenses_receipt_storage_path_key')) {
    return RPC_ERROR_MESSAGES.receipt_already_attached!
  }
  const code = error?.message?.trim()
  if (code && RPC_ERROR_MESSAGES[code]) {
    return RPC_ERROR_MESSAGES[code]
  }
  return GENERIC_MESSAGE
}
