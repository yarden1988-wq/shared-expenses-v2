'use client'

import { useActionState, useState } from 'react'
import {
  acceptInvitationAction,
  rejectInvitationAction,
  proposeChangesAction,
  acceptProposedChangesAction,
  rejectProposedChangesAction,
  type RelationshipActionFormState,
  type ProposeChangesFormState,
} from '@/app/actions/relationships'

export function AcceptRejectForm({
  invitationId,
  relationshipId,
  currentRevisionId,
}: {
  invitationId: string
  relationshipId: string
  currentRevisionId: string
}) {
  const [mode, setMode] = useState<'idle' | 'reject' | 'counter'>('idle')
  const [acceptState, acceptAction, acceptPending] = useActionState<RelationshipActionFormState, FormData>(
    acceptInvitationAction,
    undefined
  )
  const [rejectState, rejectAction, rejectPending] = useActionState<RelationshipActionFormState, FormData>(
    rejectInvitationAction,
    undefined
  )
  const [proposeState, proposeAction, proposePending] = useActionState<ProposeChangesFormState, FormData>(
    proposeChangesAction,
    undefined
  )

  return (
    <div className="flex flex-col gap-4">
      <form action={acceptAction}>
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="relationshipId" value={relationshipId} />
        <button
          type="submit"
          disabled={acceptPending}
          className="w-full rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {acceptPending ? 'מאשר/ת...' : 'קבלת ההזמנה'}
        </button>
      </form>
      {acceptState?.message && <p className="text-sm text-red-600">{acceptState.message}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === 'reject' ? 'idle' : 'reject')}
          className="flex-1 rounded border border-zinc-300 px-4 py-2"
        >
          דחייה
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === 'counter' ? 'idle' : 'counter')}
          className="flex-1 rounded border border-zinc-300 px-4 py-2"
        >
          הצעה נגדית
        </button>
      </div>

      {mode === 'reject' && (
        <form action={rejectAction} className="flex flex-col gap-2">
          <input type="hidden" name="invitationId" value={invitationId} />
          <input type="hidden" name="relationshipId" value={relationshipId} />
          <label className="text-sm">סיבת הדחייה</label>
          <textarea name="reason" required className="rounded border border-zinc-300 px-3 py-2" />
          <button
            type="submit"
            disabled={rejectPending}
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {rejectPending ? 'שולח/ת...' : 'אישור הדחייה'}
          </button>
          {rejectState?.message && <p className="text-sm text-red-600">{rejectState.message}</p>}
        </form>
      )}

      {mode === 'counter' && (
        <form action={proposeAction} className="flex flex-col gap-2">
          <input type="hidden" name="invitationId" value={invitationId} />
          <input type="hidden" name="relationshipId" value={relationshipId} />
          <input type="hidden" name="currentRevisionId" value={currentRevisionId} />
          <label className="text-sm">חלוקה מוצעת (%)</label>
          <div className="flex flex-row-reverse gap-2">
            <input
              name="parentOnePercentage"
              type="number"
              dir="ltr"
              min={0}
              max={100}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-right"
            />
            <input
              name="parentTwoPercentage"
              type="number"
              dir="ltr"
              min={0}
              max={100}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-right"
            />
          </div>
          {proposeState?.errors?.splitRatio && (
            <p className="text-sm text-red-600">{proposeState.errors.splitRatio}</p>
          )}
          <label className="text-sm">הערה</label>
          <textarea name="proposalNote" required className="rounded border border-zinc-300 px-3 py-2" />
          <button
            type="submit"
            disabled={proposePending}
            className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {proposePending ? 'שולח/ת...' : 'שליחת הצעה נגדית'}
          </button>
          {proposeState?.message && <p className="text-sm text-red-600">{proposeState.message}</p>}
        </form>
      )}
    </div>
  )
}

export function RespondToProposalForm({
  invitationId,
  relationshipId,
}: {
  invitationId: string
  relationshipId: string
}) {
  const [mode, setMode] = useState<'idle' | 'reject'>('idle')
  const [acceptState, acceptAction, acceptPending] = useActionState<RelationshipActionFormState, FormData>(
    acceptProposedChangesAction,
    undefined
  )
  const [rejectState, rejectAction, rejectPending] = useActionState<RelationshipActionFormState, FormData>(
    rejectProposedChangesAction,
    undefined
  )

  return (
    <div className="flex flex-col gap-4">
      <form action={acceptAction}>
        <input type="hidden" name="invitationId" value={invitationId} />
        <input type="hidden" name="relationshipId" value={relationshipId} />
        <button
          type="submit"
          disabled={acceptPending}
          className="w-full rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
        >
          {acceptPending ? 'מאשר/ת...' : 'קבלת ההצעה הנגדית'}
        </button>
      </form>
      {acceptState?.message && <p className="text-sm text-red-600">{acceptState.message}</p>}

      <button
        type="button"
        onClick={() => setMode(mode === 'reject' ? 'idle' : 'reject')}
        className="rounded border border-zinc-300 px-4 py-2"
      >
        דחיית ההצעה וחזרה להצעה המקורית
      </button>

      {mode === 'reject' && (
        <form action={rejectAction} className="flex flex-col gap-2">
          <input type="hidden" name="invitationId" value={invitationId} />
          <input type="hidden" name="relationshipId" value={relationshipId} />
          <label className="text-sm">סיבה</label>
          <textarea name="reason" required className="rounded border border-zinc-300 px-3 py-2" />
          <button
            type="submit"
            disabled={rejectPending}
            className="rounded bg-red-700 px-4 py-2 text-white disabled:opacity-50"
          >
            {rejectPending ? 'שולח/ת...' : 'אישור'}
          </button>
          {rejectState?.message && <p className="text-sm text-red-600">{rejectState.message}</p>}
        </form>
      )}
    </div>
  )
}
