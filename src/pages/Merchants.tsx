import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, Image as ImageIcon, Pencil, Plus, Store } from 'lucide-react'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Modal } from '../components/common/Modal'
import { Input } from '../components/common/Input'
import { useData } from '../store/data'
import type { Merchant } from '../types'

export default function Merchants() {
  const { merchants, photos, shoots, addMerchant, updateMerchant } = useData()
  const [editing, setEditing] = useState<Merchant | 'new' | null>(null)
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [error, setError] = useState<string>()

  const openEditor = (m: Merchant | 'new') => {
    setEditing(m)
    setName(m === 'new' ? '' : m.name)
    setLocation(m === 'new' ? '' : (m.location ?? ''))
    setError(undefined)
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the merchant a name.')
    try {
      if (editing === 'new') await addMerchant({ name: name.trim(), location: location.trim() || undefined })
      else if (editing) await updateMerchant(editing.id, { name: name.trim(), location: location.trim() || undefined })
      setEditing(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the merchant')
    }
  }

  const stats = (id: string) => ({
    photos: photos.filter((p) => p.merchantId === id).length,
    upcoming: shoots.filter((s) => s.merchantId === id && s.status !== 'cancelled' && new Date(s.endsAt) >= new Date()).length,
  })

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Merchants</h1>
        <Button icon={<Plus className="size-4" />} onClick={() => openEditor('new')}>New merchant</Button>
      </div>

      <div className="grid tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
        {merchants.map((m) => {
          const s = stats(m.id)
          return (
            <Card key={m.id} padding="lg" className="grid gap-3">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-(--nv-radius-md) nv-gradient-soft flex items-center justify-center text-brand-deep dark:text-brand shrink-0">
                  <Store className="size-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display font-semibold text-ink truncate">{m.name}</h3>
                  {m.location && <p className="text-sm text-ink-muted">{m.location}</p>}
                </div>
                <Button variant="ghost" size="sm" aria-label={`Edit ${m.name}`} icon={<Pencil className="size-4" />}
                        onClick={() => openEditor(m)} />
              </div>
              <div className="flex items-center gap-4 text-sm text-ink-muted">
                <span className="inline-flex items-center gap-1.5"><ImageIcon className="size-4" aria-hidden /> {s.photos} photos</span>
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden /> {s.upcoming} upcoming shoots</span>
              </div>
              <Link
                to={`/photos?merchantId=${m.id}`}
                className="text-sm font-medium text-brand-deep dark:text-brand hover:underline justify-self-start"
              >
                View photos →
              </Link>
            </Card>
          )
        })}
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'New merchant' : 'Edit merchant'}>
        <form onSubmit={save} className="grid gap-4">
          <Input label="Name" placeholder="e.g. Café Aroma" value={name} error={error}
                 onChange={(e) => { setName(e.target.value); setError(undefined) }} autoFocus />
          <Input label="Location" placeholder="e.g. Hulhumalé" value={location} onChange={(e) => setLocation(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit">{editing === 'new' ? 'Create merchant' : 'Save changes'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
