'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  validateRelationshipInviteInput,
  validateSplitRatio,
  type RelationshipInviteFieldErrors,
} from '@/lib/validation/relationship-invite'
import { validateChildInput, type ChildInput, type ChildFieldErrors } from '@/lib/validation/child'
import { mapRelationshipErrorToHebrew } from '@/lib/relationships/errors'

function parseChildren(raw: string): ChildInput[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (c): c is ChildInput =>
        c && typeof c.fullName === 'string' && typeof c.dateOfBirth === 'string' && typeof c.gender === 'string'
    )
  } catch {
    return []
  }
}

// ---- Create invitation (includes initial children — required by the RPC) ----

export type CreateInvitationFormState =
  | {
      errors?: RelationshipInviteFieldErrors
      message?: string
    }
  | undefined

export async function createInvitationAction(
  _prevState: CreateInvitationFormState,
  formData: FormData
): Promise<CreateInvitationFormState> {
  const email = String(formData.get('email') ?? '')
  const parentOneRaw = String(formData.get('parentOnePercentage') ?? '')
  const parentTwoRaw = String(formData.get('parentTwoPercentage') ?? '')
  const parentOnePercentage = parentOneRaw === '' ? null : Number(parentOneRaw)
  const parentTwoPercentage = parentTwoRaw === '' ? null : Number(parentTwoRaw)
  const children = parseChildren(String(formData.get('children') ?? '[]'))

  const errors = validateRelationshipInviteInput({
    email,
    parentOnePercentage,
    parentTwoPercentage,
    children,
  })

  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()

  const { error } = await supabase.rpc('create_relationship_invitation', {
    p_invited_email: email.trim(),
    p_parent_one_percentage: parentOnePercentage,
    p_parent_two_percentage: parentTwoPercentage,
    p_proposal_note: null,
    // RPC expects camelCase keys inside the jsonb array (fullName/
    // dateOfBirth/gender), not the snake_case column names.
    p_children: children.map((c) => ({
      fullName: c.fullName.trim(),
      dateOfBirth: c.dateOfBirth,
      gender: c.gender,
    })),
  })

  if (error) {
    return { message: mapRelationshipErrorToHebrew(error) }
  }

  redirect('/dashboard/relationships')
}

// ---- Accept / reject the initial invitation ----

export type RelationshipActionFormState =
  | {
      message?: string
    }
  | undefined

export async function acceptInvitationAction(
  _prevState: RelationshipActionFormState,
  formData: FormData
): Promise<RelationshipActionFormState> {
  const invitationId = String(formData.get('invitationId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_invitation', {
    p_invitation_id: invitationId,
  })

  if (error) {
    return { message: mapRelationshipErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}`)
}

export async function rejectInvitationAction(
  _prevState: RelationshipActionFormState,
  formData: FormData
): Promise<RelationshipActionFormState> {
  const invitationId = String(formData.get('invitationId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const reason = String(formData.get('reason') ?? '')

  if (!reason.trim()) {
    return { message: 'יש לציין סיבה לדחייה.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_invitation', {
    p_invitation_id: invitationId,
    p_reason: reason.trim(),
  })

  if (error) {
    return { message: mapRelationshipErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}`)
}

// ---- Counter-proposal (ratio only for Fast Beta — existing children are
// carried through unchanged, since the RPC requires a full children array
// regardless of what actually changed) ----

export type ProposeChangesFormState =
  | {
      errors?: { splitRatio?: string }
      message?: string
    }
  | undefined

export async function proposeChangesAction(
  _prevState: ProposeChangesFormState,
  formData: FormData
): Promise<ProposeChangesFormState> {
  const invitationId = String(formData.get('invitationId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const currentRevisionId = String(formData.get('currentRevisionId') ?? '')
  const proposalNote = String(formData.get('proposalNote') ?? '')
  const parentOneRaw = String(formData.get('parentOnePercentage') ?? '')
  const parentTwoRaw = String(formData.get('parentTwoPercentage') ?? '')
  const parentOnePercentage = parentOneRaw === '' ? null : Number(parentOneRaw)
  const parentTwoPercentage = parentTwoRaw === '' ? null : Number(parentTwoRaw)

  const splitError = validateSplitRatio(parentOnePercentage, parentTwoPercentage)
  if (splitError) {
    return { errors: { splitRatio: splitError } }
  }

  if (!proposalNote.trim()) {
    return { message: 'יש להוסיף הערה המסבירה את ההצעה.' }
  }

  const supabase = await createClient()

  const { data: currentChildren, error: fetchError } = await supabase
    .from('relationship_revision_children')
    .select('full_name, date_of_birth, gender')
    .eq('revision_id', currentRevisionId)

  if (fetchError || !currentChildren || currentChildren.length === 0) {
    return { message: 'לא ניתן היה לטעון את פרטי הילדים הקיימים.' }
  }

  const { error } = await supabase.rpc('propose_relationship_changes', {
    p_invitation_id: invitationId,
    p_parent_one_percentage: parentOnePercentage,
    p_parent_two_percentage: parentTwoPercentage,
    p_proposal_note: proposalNote.trim(),
    p_children: currentChildren.map((c) => ({
      fullName: c.full_name,
      dateOfBirth: c.date_of_birth,
      gender: c.gender,
    })),
  })

  if (error) {
    return { message: mapRelationshipErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}`)
}

// ---- Original inviter responds to a counter-proposal ----

export async function acceptProposedChangesAction(
  _prevState: RelationshipActionFormState,
  formData: FormData
): Promise<RelationshipActionFormState> {
  const invitationId = String(formData.get('invitationId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')

  const supabase = await createClient()
  const { error } = await supabase.rpc('accept_proposed_changes', {
    p_invitation_id: invitationId,
  })

  if (error) {
    return { message: mapRelationshipErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}`)
}

export async function rejectProposedChangesAction(
  _prevState: RelationshipActionFormState,
  formData: FormData
): Promise<RelationshipActionFormState> {
  const invitationId = String(formData.get('invitationId') ?? '')
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const reason = String(formData.get('reason') ?? '')

  if (!reason.trim()) {
    return { message: 'יש לציין סיבה.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_proposed_changes_and_restore', {
    p_invitation_id: invitationId,
    p_reason: reason.trim(),
  })

  if (error) {
    return { message: mapRelationshipErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}`)
}

// ---- Add child to an already-active relationship ----

export type AddChildFormState =
  | {
      errors?: ChildFieldErrors
      message?: string
    }
  | undefined

export async function addChildAction(
  _prevState: AddChildFormState,
  formData: FormData
): Promise<AddChildFormState> {
  const relationshipId = String(formData.get('relationshipId') ?? '')
  const fullName = String(formData.get('fullName') ?? '')
  const dateOfBirth = String(formData.get('dateOfBirth') ?? '')
  const gender = String(formData.get('gender') ?? '')

  const errors = validateChildInput({ fullName, dateOfBirth, gender })
  if (Object.keys(errors).length > 0) {
    return { errors }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_child_to_relationship', {
    p_relationship_id: relationshipId,
    p_full_name: fullName.trim(),
    p_date_of_birth: dateOfBirth,
    p_gender: gender,
  })

  if (error) {
    return { message: mapRelationshipErrorToHebrew(error) }
  }

  redirect(`/dashboard/relationships/${relationshipId}/children`)
}
