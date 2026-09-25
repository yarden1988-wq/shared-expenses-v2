// Relationship statuses where debt could exist and settlement/viewing
// remains meaningful: expenses require 'active' to be created, so any of
// these three could hold real historical debt. Excludes 'pending_invitee'/
// 'pending_inviter'/'rejected', which can never have accumulated any.
// Mirrors record_payment's own status gate in
// supabase/migrations/20260925000000_add_payments_settlement.sql exactly
// — keep both in sync if that RPC's allowed statuses ever change.
export const SETTLEABLE_RELATIONSHIP_STATUSES: string[] = ['active', 'archive_requested', 'archived']
