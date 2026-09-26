# Receipt flow — manual two-user acceptance

Scope: receipt upload/replace/remove in the expense form, receipt download on
the expense page, and (phase B) the `20260926000000_validate_receipt_storage_path`
migration once it is approved and applied.

## Setup

- **A** and **B**: two accounts in the same **active** relationship `R`
  (with at least one child).
- **C**: a third account that is not in `R`.
- Test files:
  - `ok.jpg` (under 1 MB)
  - `ok.pdf`
  - `ok.png` or `ok.webp`
  - `big.jpg` (over 10 MB)
  - `fake.jpg`: a `.txt` file renamed to `.jpg`
  - `photo.heic`, if you have one
- Use a phone-width viewport (or a real phone) for at least one full pass.
- Keep the Supabase dashboard open (Storage → `receipts`) to watch the objects.

## Phase A: runs against the CURRENT live schema (before the follow-up migration)

### Upload during create (A)

1. Open **New expense**. The receipt card should say "לא צורפה קבלה" and show a **צירוף קבלה** button.
2. Pick `big.jpg` → error "הקובץ גדול מדי…". Nothing is uploaded (the bucket is unchanged).
3. Pick `fake.jpg` → error "תוכן הקובץ אינו תואם…". Nothing is uploaded.
4. Pick `photo.heic` (if the picker allows it) → the type error appears. Nothing is uploaded.
5. Pick `ok.jpg`:
   - While uploading, the card shows "מעלה את הקבלה…" and the save button is disabled ("ממתין לסיום העלאת הקבלה...").
   - When it finishes, it shows "הקבלה הועלתה ותישמר עם ההוצאה" plus the filename.
   - In the dashboard, the object is `relationships/<R>/<uuid>.jpg`: lowercase, and the original filename does not appear in the path.
6. **Replace before saving:** pick `ok.pdf` → the card updates. In the dashboard the unsaved `.jpg` has been deleted and only the `.pdf` remains.
7. Fill in the form and save as a draft. You land on the expense page, which shows "קבלה מצורפת · PDF" with a **הורדה** button.
8. Tap **הורדה**. The file downloads (it is not shown in the tab) as `receipt-<expenseId>.pdf` and opens correctly.
   - In DevTools → Network, the response has:
     - `Content-Disposition: attachment`
     - `X-Content-Type-Options: nosniff`
     - `Cache-Control: private, no-store`
   - No `supabase.co` URL is ever visible to the browser.

### Draft privacy (B, C)

9. **B** opens `/dashboard/relationships/<R>/expenses/<expenseId>/receipt` directly → 404 (the draft is invisible to B).
10. **C** opens the same URL → 404. Signed out, the URL redirects to login.

### Edit without touching the receipt (A)

11. **A** edits the draft, changes only the merchant name, and saves. The receipt is **still attached** and still downloads (regression check: `update_expense` overwrites the path column).

### Submit → approver access (A, B)

12. **A** submits the expense.
13. **B** opens the expense and sees "קבלה מצורפת". **הורדה** works for B.
14. **B** requests changes.

### Replace after changes requested (A)

15. **A** edits the expense:
    - The card shows "קבלה מצורפת (PDF)" with **החלפת קבלה** and **הסרת קבלה**.
    - **החלפת קבלה** → pick `ok.png` → the card says "הקבלה הקודמת תוחלף בעת השמירה".
    - **ביטול ושמירת הקבלה הקודמת** restores the PDF, and the unsaved PNG is deleted from the bucket.
    - Replace with `ok.png` again and save.
16. Check the result:
    - The expense page shows "תמונה", and the download is the PNG.
    - In the dashboard, the old PDF is **gone**, and it was deleted only after the save succeeded.
17. **Failure ordering check:** replace the receipt again, but before saving, make the save fail (e.g. clear all items so validation fails, or set the date to the future). The old receipt must still be in the bucket and still attached.

### Remove (A)

18. **A** edits the expense, taps **הסרת קבלה** → "הקבלה תוסר בעת השמירה", then saves.
    - The page shows "לא צורפה קבלה".
    - The old object has been deleted from the bucket.

### Uploader-only delete and referenced-object protection (browser console, as A/B)

19. Re-attach a receipt, submit, and have **B** approve it.
20. As **A**, run `supabase.storage.from('receipts').remove(['<that path>'])` from the console.
    - The object must **still exist**, because an approved expense references it.
21. As **B**, try to remove any object A uploaded → it still exists.
22. As **A**, try `upload('<an existing path>', file, { upsert: true })` → denied.

### Errors and states

23. Go offline (DevTools) and pick a file → "העלאת הקבלה נכשלה…". The form stays usable and you can retry.
24. RTL layout at 360px width:
    - The buttons wrap.
    - Tap targets are at least 44px.
    - The filename truncates.
    - Nothing scrolls horizontally.

## Phase B: after `20260926000000_validate_receipt_storage_path.sql` is approved and applied

Run the pre-apply checks listed in the migration header first. Then run these as RPC calls from the console, as **A**:

| Call | Expected |
|---|---|
| `create_expense`/`update_expense` with a receipt path A uploaded | success |
| well-formed path to a non-existent object | `receipt_not_found` → "הקבלה לא נמצאה…" |
| path to an object **B** uploaded (in R) | `receipt_not_found` |
| path under another relationship | `invalid_receipt_storage_path` |
| uppercase uuid / `.JPG` / `.gif` | `invalid_receipt_storage_path` |
| same path on a second expense | `receipt_already_attached` → "קבלה זו כבר מצורפת…" |
| edit with unchanged path | success |
| edit with path `null` | success |
| submit / approve / reject an expense with a receipt | unaffected |

After that, rerun Phase A steps 5–18 end to end. The UI flow must behave identically.
