// Mirrors the ACTUAL password policy enforced by the approved Supabase
// project (confirmed by inspecting live AuthWeakPasswordError responses,
// not assumed): minimum 8 characters, at least one lowercase letter, one
// uppercase letter, and one digit. No special-character requirement is
// enforced by the project. Supabase remains the final authority — this
// exists so the client/server can fail fast and give specific feedback
// before ever calling signUp, not to replace Supabase's own validation.

export type PasswordRequirement = {
  key: 'length' | 'lowercase' | 'uppercase' | 'digit'
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { key: 'length', label: 'לפחות 8 תווים', test: (p) => p.length >= 8 },
  { key: 'lowercase', label: 'אות קטנה אחת לפחות (a-z)', test: (p) => /[a-z]/.test(p) },
  { key: 'uppercase', label: 'אות גדולה אחת לפחות (A-Z)', test: (p) => /[A-Z]/.test(p) },
  { key: 'digit', label: 'ספרה אחת לפחות (0-9)', test: (p) => /[0-9]/.test(p) },
]

export function getUnmetPasswordRequirements(password: string): PasswordRequirement[] {
  return PASSWORD_REQUIREMENTS.filter((r) => !r.test(password))
}

export function isPasswordCompliant(password: string): boolean {
  return getUnmetPasswordRequirements(password).length === 0
}
