import { useState } from 'react'
import { CalendarDays, Check, MapPin, Pencil, Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import type { Shoot } from '../../types'
import { SHOOT_STATUS_META, shootDisplayStatus } from '../../types'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Modal } from '../common/Modal'
import { AvatarGroup } from '../common/Avatar'
import { ShootForm } from './ShootForm'
import { useData } from '../../store/data'

/** Shoot modal: details + the status pipeline. Ongoing is derived, so the
 *  actions move the stored status: confirm, complete, cancel, reopen. */
export function ShootDetail({ shootId, onClose }: { shootId: string | null; onClose: () => void }) {
  const { shoots, merchants, projects, updateShoot, deleteShoot } = useData()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const shoot = shoots.find((s) => s.id === shootId)
  const merchant = shoot?.merchantId ? merchants.find((m) => m.id === shoot.merchantId) : undefined
  const project = shoot?.projectId ? projects.find((p) => p.id === shoot.projectId) : undefined
  const display = shoot ? shootDisplayStatus(shoot) : 'planning'

  const close = () => { setEditing(false); setConfirmDelete(false); onClose() }
  const move = (status: Shoot['status']) => shoot && void updateShoot(shoot.id, { status })

  return (
    <Modal open={shoot !== undefined} onClose={close} size="lg" title={editing ? 'Edit shoot' : (shoot?.title ?? '')}>
      {shoot && (editing ? (
        <ShootForm
          initial={shoot}
          onSubmit={(values) => { void updateShoot(shoot.id, values); setEditing(false) }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="grid gap-5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Badge tone={SHOOT_STATUS_META[display].tone}>{SHOOT_STATUS_META[display].label}</Badge>
            {shoot.gcalSynced && <Badge tone="neutral">Google Calendar ✓</Badge>}
            <Button variant="secondary" size="sm" className="ml-auto" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
          </div>

          <div className="grid gap-2 text-sm text-ink-2">
            <span className="inline-flex items-center gap-2">
              <CalendarDays className="size-4 text-ink-muted" aria-hidden />
              {format(new Date(shoot.startsAt), 'EEE d MMM, HH:mm')} – {format(new Date(shoot.endsAt), 'HH:mm')}
            </span>
            {shoot.location && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="size-4 text-ink-muted" aria-hidden /> {shoot.location}
              </span>
            )}
            {(merchant || project) && (
              <span className="text-ink-muted">
                {merchant && <>Merchant: <span className="text-ink font-medium">{merchant.name}</span></>}
                {merchant && project && ' · '}
                {project && <>Project: <span className="text-ink font-medium">{project.name}</span></>}
              </span>
            )}
            {shoot.crew.length > 0 && (
              <span className="inline-flex items-center gap-2 text-ink-muted">Crew <AvatarGroup users={shoot.crew} size="xs" /></span>
            )}
          </div>

          {shoot.description && <p className="text-sm text-ink-2 whitespace-pre-wrap">{shoot.description}</p>}

          <div className="border-t border-border pt-4 flex items-center gap-2 flex-wrap">
            {shoot.status === 'planning' && (
              <Button size="sm" icon={<Check className="size-4" />} onClick={() => move('confirmed')}>Confirm shoot</Button>
            )}
            {shoot.status === 'confirmed' && (
              <>
                <Button size="sm" icon={<Check className="size-4" />} onClick={() => move('completed')}>
                  {display === 'wrap_up' ? 'Wrap up — mark completed' : 'Mark completed'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => move('planning')}>Back to planning</Button>
              </>
            )}
            {(shoot.status === 'planning' || shoot.status === 'confirmed') && (
              <Button variant="secondary" size="sm" icon={<X className="size-4" />} onClick={() => move('cancelled')}>Cancel shoot</Button>
            )}
            {(shoot.status === 'completed' || shoot.status === 'cancelled') && (
              <Button variant="secondary" size="sm" onClick={() => move('confirmed')}>Reopen as confirmed</Button>
            )}
            {confirmDelete ? (
              <span className="ml-auto flex items-center gap-2 text-sm">
                <span className="text-ink-muted">Delete permanently?</span>
                <Button variant="danger" size="sm" onClick={() => { void deleteShoot(shoot.id); close() }}>Delete</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Keep</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" className="ml-auto" aria-label="Delete shoot"
                      icon={<Trash2 className="size-4" />} onClick={() => setConfirmDelete(true)} />
            )}
          </div>
        </div>
      ))}
    </Modal>
  )
}
