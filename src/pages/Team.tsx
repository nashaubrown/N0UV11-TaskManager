import { useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, ScrollText, ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { Avatar } from '../components/common/Avatar'
import { Badge } from '../components/common/Badge'
import { Button } from '../components/common/Button'
import { Card, CardHeader } from '../components/common/Card'
import { Modal } from '../components/common/Modal'
import { Input, Select } from '../components/common/Input'
import { useData } from '../store/data'
import { useAuth } from '../store/auth'
import { api, DEMO } from '../services/api'
import { ROLE_META, type OrgRole } from '../types'
import { timeAgo } from '../utils/format'

type AssignableRole = Exclude<OrgRole, 'owner'>
const ASSIGNABLE: AssignableRole[] = ['admin', 'manager', 'member', 'viewer']

interface AuditEntry {
  id: string
  actor?: { fullName: string }
  guestLabel?: string
  action: string
  entityType: string
  createdAt: string
}

export default function Team() {
  const { members, inviteMember, setMemberRole, removeMember } = useData()
  const { user, role } = useAuth()
  const isAdmin = role === 'admin' || role === 'owner'
  const isOwner = role === 'owner'

  const [inviting, setInviting] = useState(false)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<AssignableRole>('member')
  const [tempPassword, setTempPassword] = useState<string>()
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string>()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [audit, setAudit] = useState<AuditEntry[] | null>(null)

  useEffect(() => {
    if (!isAdmin || DEMO) return
    api<{ items: AuditEntry[] }>('GET', '/org/audit?limit=20')
      .then((d) => setAudit(d.items))
      .catch(() => setAudit(null))
  }, [isAdmin])

  const invite = async (e: FormEvent) => {
    e.preventDefault()
    if (!fullName.trim() || !email.trim()) return setError('Name and email are both needed.')
    try {
      const result = await inviteMember({ fullName: fullName.trim(), email: email.trim(), role: inviteRole })
      setTempPassword(result.tempPassword)
      setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account')
    }
  }

  const closeInvite = () => {
    setInviting(false)
    setTempPassword(undefined)
    setFullName(''); setEmail(''); setInviteRole('member'); setError(undefined); setCopied(false)
  }

  /** Admins manage roles below admin; only the owner touches admins. */
  const canManage = (targetRole: OrgRole) =>
    isAdmin && targetRole !== 'owner' && (isOwner || targetRole !== 'admin')

  return (
    <div className="grid gap-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Team</h1>
        {isAdmin && (
          <Button icon={<UserPlus className="size-4" />} onClick={() => setInviting(true)}>Invite member</Button>
        )}
      </div>

      <div className="grid desktop:grid-cols-5 gap-6 items-start">
        {/* members */}
        <Card padding="md" className="desktop:col-span-3">
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1">
                <Avatar user={m} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate">
                    {m.fullName}
                    {m.id === user?.id && <span className="text-ink-faint font-normal"> (you)</span>}
                  </p>
                  <p className="text-xs text-ink-muted truncate">{m.email}</p>
                </div>
                {canManage(m.role) && m.id !== user?.id ? (
                  <>
                    <Select
                      aria-label={`Role for ${m.fullName}`}
                      value={m.role}
                      onChange={(e) => void setMemberRole(m.id, e.target.value as AssignableRole)}
                      className="w-32"
                    >
                      {ASSIGNABLE.filter((r) => isOwner || r !== 'admin').map((r) => (
                        <option key={r} value={r}>{ROLE_META[r].label}</option>
                      ))}
                    </Select>
                    {confirmRemove === m.id ? (
                      <span className="flex items-center gap-1">
                        <Button variant="danger" size="sm" onClick={() => { void removeMember(m.id); setConfirmRemove(null) }}>
                          Remove
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(null)}>Keep</Button>
                      </span>
                    ) : (
                      <Button variant="ghost" size="sm" aria-label={`Remove ${m.fullName}`}
                              icon={<Trash2 className="size-4" />} onClick={() => setConfirmRemove(m.id)} />
                    )}
                  </>
                ) : (
                  <Badge tone={ROLE_META[m.role].tone}>{ROLE_META[m.role].label}</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <div className="desktop:col-span-2 grid gap-6">
          {/* role explainer */}
          <Card padding="lg">
            <CardHeader title="Roles" subtitle="What each level can do" />
            <ul className="grid gap-2.5 mt-2">
              {(Object.keys(ROLE_META) as OrgRole[]).map((r) => (
                <li key={r} className="flex gap-2.5 items-start">
                  <ShieldCheck className="size-4 text-ink-muted mt-0.5 shrink-0" aria-hidden />
                  <p className="text-sm text-ink-2">
                    <Badge tone={ROLE_META[r].tone}>{ROLE_META[r].label}</Badge>{' '}
                    <span className="text-ink-muted">{ROLE_META[r].description}</span>
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          {/* audit trail (admins) */}
          {isAdmin && (
            <Card padding="lg">
              <CardHeader title="Recent activity" subtitle="From the audit log" />
              {DEMO ? (
                <p className="text-sm text-ink-muted mt-2">The audit log is live when connected to the API.</p>
              ) : audit === null ? (
                <p className="text-sm text-ink-muted mt-2">Could not load the audit log.</p>
              ) : (
                <ul className="grid gap-2 mt-2">
                  {audit.slice(0, 12).map((a) => (
                    <li key={a.id} className="flex items-start gap-2 text-sm">
                      <ScrollText className="size-3.5 text-ink-faint mt-1 shrink-0" aria-hidden />
                      <p className="text-ink-2 min-w-0">
                        <span className="font-medium text-ink">{a.actor?.fullName ?? a.guestLabel ?? 'System'}</span>{' '}
                        <span className="text-ink-muted">{a.action.replace(/[._]/g, ' ')}</span>{' '}
                        <span className="text-ink-faint">· {timeAgo(a.createdAt)}</span>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </div>
      </div>

      <Modal open={inviting} onClose={closeInvite} title={tempPassword ? 'Account created' : 'Invite a team member'}>
        {tempPassword ? (
          <div className="grid gap-3">
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">{fullName}</span> can log in with{' '}
              <span className="font-medium text-ink">{email}</span> and this one-time password:
            </p>
            <div className="flex gap-2">
              <input
                readOnly value={tempPassword} aria-label="Temporary password"
                className="flex-1 h-10 rounded-(--nv-radius-md) border border-border bg-surface-2 text-ink px-3 text-sm font-mono"
                onFocus={(e) => e.target.select()}
              />
              <Button
                icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                onClick={() => { void navigator.clipboard.writeText(tempPassword).then(() => setCopied(true)) }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-ink-muted">Shown once — share it with them securely. They join as {ROLE_META[inviteRole].label}.</p>
            <div className="flex justify-end"><Button onClick={closeInvite}>Done</Button></div>
          </div>
        ) : (
          <form onSubmit={invite} className="grid gap-4">
            <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
            <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Select label="Role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as AssignableRole)}
                    hint={ROLE_META[inviteRole].description}>
              {ASSIGNABLE.filter((r) => isOwner || r !== 'admin').map((r) => (
                <option key={r} value={r}>{ROLE_META[r].label}</option>
              ))}
            </Select>
            {error && <p role="alert" className="text-sm text-error">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeInvite}>Cancel</Button>
              <Button type="submit">Create account</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
