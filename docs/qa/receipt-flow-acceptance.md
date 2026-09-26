# Receipt flow — two-user manual acceptance

Live schema: `20260925120000_add_receipt_storage` + `20260926000000_validate_receipt_storage_path` (both applied).
None of these steps has been executed by Claude — record real results only.

**Accounts**
- **A** and **B**: two members of the same active relationship **R**, with at least one child.
- **C**: signed in, but not a member of R.

**Files**
- `ok.jpg` (under 1 MB) and `ok.pdf`
- `big.jpg` (over 10 MB)
- `fake.jpg` (a `.txt` renamed to `.jpg`)
- `doc.gif` or `.heic`

Keep Supabase → Storage → `receipts` → `relationships/<R>/` open to watch objects appear and disappear. Do at least one full pass at phone width.

| # | Who | Steps | Expected |
|---|---|---|---|
| 1 | A | New expense → **צירוף קבלה** → pick `doc.gif` / `.heic` | "ניתן לצרף רק קובץ JPG, PNG, WEBP או PDF." No new object. |
| 2 | A | Pick `big.jpg` | "הקובץ גדול מדי. הגודל המרבי הוא 10MB." No new object. |
| 3 | A | Pick `fake.jpg` | "תוכן הקובץ אינו תואם את סוג הקובץ." No new object. |
| 4 | A | Pick `ok.jpg` | While uploading: "מעלה את הקבלה…" and Save disabled. Then "הקבלה הועלתה · תצורף בשמירת ההוצאה". New object `<uuid>.jpg` (lowercase; original filename not in path). |
| 5 | A | Fill the form, **Save as draft** | Detail page shows "קבלה מצורפת". **הורדת קבלה** downloads `receipt-<id>.jpg`, as a download, not opened inline. |
| 6 | B | Open the expense list, then A's draft URL, then `…/expenses/<id>/receipt` | The draft is not listed. The page is a 404. The receipt URL redirects to the same 404. |
| 7 | C | Open `…/relationships/<R>/expenses/<id>/receipt` | Redirects to a 404. No file. |
| 8 | A | **Submit** | Status "ממתין לאישור". |
| 9 | B | Open the expense → **הורדת קבלה** | Download succeeds. |
| 10 | B | Request changes | Status "נדרשים שינויים". |
| 11 | A | Edit → change only the merchant name → Save | Receipt **still attached** (regression check). |
| 12 | A | Edit → **החלפת קבלה** → pick `ok.pdf` | "הקבלה הקודמת תוחלף בעת השמירה." Both objects now exist. |
| 13 | A | **ביטול ושמירת הקבלה הקודמת** (undo) | Back to "קבלה מצורפת". The new PDF object is deleted. |
| 14 | A | **Failed save:** replace with `ok.pdf` again, clear every item description, Save | Validation error, and the receipt field keeps the new PDF. **The old JPG still exists and is still attached** (check the detail page in another tab). |
| 15 | A | Leave the edit page via **ביטול וחזרה** without saving | The unsaved PDF object is deleted. The old JPG is still attached. |
| 16 | A | Edit → replace with `ok.pdf` → Save | Detail page shows the PDF. The old JPG object is **gone**, deleted only after the save. |
| 17 | A | Edit → **הסרת קבלה** → "הקבלה תוסר בעת השמירה" → Save | "אין קבלה מצורפת". The PDF object is gone. |
| 18 | A, B | Attach a new receipt → submit → B **rejects** | B can still download. A has no edit button. In A's console, `supabase.storage.from('receipts').remove(['<path>'])` leaves the object in place. |
| 19 | A | **Duplicate path:** on another draft, run `update_expense` from the console with the rejected expense's receipt path (or save the form with that path) | Rejected with "קבלה זו כבר מצורפת להוצאה אחרת…". Nothing changes. |
| 20 | B | Upload anything, then try to attach it to one of A's expenses, or delete one of A's objects, from the console | Denied: `receipt_not_found` on attach. The delete leaves the object in place. |
| 21 | A | Delete a receipt object from the dashboard while it is attached, then click **הורדת קבלה** | Back on the expense page, with the Hebrew notice "לא ניתן היה להוריד את הקבלה…". Nothing crashes. Refreshing clears the notice. |
| 22 | A | Go offline (DevTools) → pick `ok.jpg` | "העלאת הקבלה נכשלה…". The form stays usable, and a retry works once you are back online. |

**Check in DevTools on the step 5 or step 9 download**
- The response headers include `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff` and `Cache-Control: private, no-store`.
- No `supabase.co` URL appears in the page or in the Network tab.
