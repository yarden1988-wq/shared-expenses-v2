import { createClient } from '@/lib/supabase/server'

export type RelationshipSummary = {
  id: string
  status: string
  createdBy: string
  createdAt: string
  invitation: {
    id: string
    invitedEmail: string
    invitedUserId: string | null
    status: string
    currentRevisionId: string
  } | null
  revision: {
    id: string
    parentOnePercentage: number
    parentTwoPercentage: number
    proposalNote: string | null
  } | null
  counterpartName: string | null
}

type InvitationRow = {
  id: string
  invited_email: string
  invited_user_id: string | null
  status: string
  current_revision_id: string
}

type RelationshipRow = {
  id: string
  status: string
  created_by: string
  created_at: string
  relationship_invitations: InvitationRow[] | InvitationRow | null
}

export async function getRelationshipsForCurrentUser(): Promise<RelationshipSummary[]> {
  const supabase = await createClient()
  const { data: relationships, error } = await supabase
    .from('relationships')
    .select(
      'id, status, created_by, created_at, relationship_invitations(id, invited_email, invited_user_id, status, current_revision_id)'
    )
    .order('created_at', { ascending: false })

  if (error || !relationships) {
    return []
  }

  const rows = relationships as unknown as RelationshipRow[]

  return Promise.all(
    rows.map(async (r) => {
      const invitationRaw = Array.isArray(r.relationship_invitations)
        ? r.relationship_invitations[0]
        : r.relationship_invitations

      let revision: RelationshipSummary['revision'] = null
      if (invitationRaw?.current_revision_id) {
        const { data: rev } = await supabase
          .from('relationship_revisions')
          .select('id, parent_one_percentage, parent_two_percentage, proposal_note')
          .eq('id', invitationRaw.current_revision_id)
          .maybeSingle()
        if (rev) {
          revision = {
            id: rev.id,
            parentOnePercentage: rev.parent_one_percentage,
            parentTwoPercentage: rev.parent_two_percentage,
            proposalNote: rev.proposal_note,
          }
        }
      }

      const { data: counterpartName } = await supabase.rpc('get_relationship_counterpart_name', {
        p_relationship_id: r.id,
      })

      return {
        id: r.id,
        status: r.status,
        createdBy: r.created_by,
        createdAt: r.created_at,
        invitation: invitationRaw
          ? {
              id: invitationRaw.id,
              invitedEmail: invitationRaw.invited_email,
              invitedUserId: invitationRaw.invited_user_id,
              status: invitationRaw.status,
              currentRevisionId: invitationRaw.current_revision_id,
            }
          : null,
        revision,
        counterpartName: (counterpartName as string | null) ?? null,
      }
    })
  )
}

export async function getRelationshipById(id: string): Promise<RelationshipSummary | null> {
  const all = await getRelationshipsForCurrentUser()
  return all.find((r) => r.id === id) ?? null
}
