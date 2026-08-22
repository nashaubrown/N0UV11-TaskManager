import { useMemo, useState, type FormEvent } from 'react'
import { ChevronLeft, ChevronRight, Handshake, Plus } from 'lucide-react'
import clsx from 'clsx'
import { Button } from '../components/common/Button'
import { Badge } from '../components/common/Badge'
import { Modal } from '../components/common/Modal'
import { Input, Select } from '../components/common/Input'
import { useData } from '../store/data'
import { DEAL_STAGES, DEAL_STAGE_META, type Deal, type DealStage } from '../types'

const money = (cents: number | undefined, currency: string) =>
  cents === undefined
    ? '—'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(cents / 100)

function DealCard({ deal, onMove }: { deal: Deal; onMove: (stage: DealStage) => void }) {
  const idx = DEAL_STAGES.indexOf(deal.stage)
  const prev = idx > 0 ? DEAL_STAGES[idx - 1] : null
  const next = idx < DEAL_STAGES.length - 1 ? DEAL_STAGES[idx + 1] : null
  return (
    <div className="rounded-(--nv-radius-md) border border-border bg-surface p-3 grid gap-1.5 shadow-sm">
      <p className="text-sm font-medium text-ink leading-snug">{deal.name}</p>
      <p className="text-sm text-ink-2 font-semibold tabular-nums">{money(deal.valueCents, deal.currency)}</p>
      {deal.contact && (
        <p className="text-xs text-ink-muted truncate">
          {deal.contact.fullName}
          {deal.contact.company && ` · ${deal.contact.company}`}
        </p>
      )}
      {deal.expectedClose && (
        <p className="text-xs text-ink-faint">Close by {new Date(deal.expectedClose).toLocaleDateString()}</p>
      )}
      <div className="flex items-center gap-1 mt-1">
        {prev && (
          <Button variant="ghost" size="sm" aria-label={`Move back to ${DEAL_STAGE_META[prev].label}`}
                  icon={<ChevronLeft className="size-4" />} onClick={() => onMove(prev)} />
        )}
        {next && (
          <Button
            variant="secondary" size="sm" className="ml-auto"
            iconRight={<ChevronRight className="size-4" />}
            onClick={() => onMove(next)}
          >
            {DEAL_STAGE_META[next].label}
          </Button>
        )}
      </div>
    </div>
  )
}

export default function Deals() {
  const { deals, contacts, addDeal, updateDeal, addContact } = useData()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [value, setValue] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [stage, setStage] = useState<DealStage>('lead')
  const [contactId, setContactId] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newContactCompany, setNewContactCompany] = useState('')
  const [error, setError] = useState<string>()

  const byStage = useMemo(
    () => DEAL_STAGES.map((s) => ({
      stage: s,
      deals: deals.filter((d) => d.stage === s),
      total: deals.filter((d) => d.stage === s).reduce((n, d) => n + (d.valueCents ?? 0), 0),
    })),
    [deals],
  )

  const openValue = deals
    .filter((d) => !['closed_won', 'closed_lost'].includes(d.stage))
    .reduce((n, d) => n + (d.valueCents ?? 0), 0)
  const wonValue = deals.filter((d) => d.stage === 'closed_won').reduce((n, d) => n + (d.valueCents ?? 0), 0)

  const create = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the deal a name.')
    try {
      let cid: string | undefined = contactId || undefined
      if (contactId === '__new' && newContactName.trim()) {
        const contact = await addContact({ fullName: newContactName.trim(), company: newContactCompany.trim() || undefined })
        cid = contact.id
      } else if (contactId === '__new') {
        cid = undefined
      }
      await addDeal({
        name: name.trim(),
        stage,
        valueCents: value ? Math.round(parseFloat(value) * 100) : undefined,
        currency,
        contactId: cid,
      })
      setCreating(false)
      setName(''); setValue(''); setStage('lead'); setContactId(''); setNewContactName(''); setNewContactCompany(''); setError(undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the deal')
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Deals</h1>
        <div className="flex items-center gap-3">
          <p className="text-sm text-ink-muted tabular-nums hidden tablet:block">
            Open <span className="font-semibold text-ink">{money(openValue, 'USD')}</span>
            {' · '}Won <span className="font-semibold text-success">{money(wonValue, 'USD')}</span>
          </p>
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New deal</Button>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="grid place-items-center py-20 text-center gap-2">
          <Handshake className="size-8 text-ink-faint" aria-hidden />
          <p className="font-medium text-ink">No deals yet</p>
          <p className="text-sm text-ink-muted">Track merchant work from lead to closed-won.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 items-start">
          {byStage.map(({ stage: s, deals: stageDeals, total }) => (
            <section key={s} className="w-64 shrink-0 grid gap-2">
              <header className={clsx(
                'flex items-center gap-2 px-1',
                (s === 'closed_won' || s === 'closed_lost') && 'opacity-80',
              )}>
                <Badge tone={DEAL_STAGE_META[s].tone}>{DEAL_STAGE_META[s].label}</Badge>
                <span className="text-xs text-ink-muted tabular-nums">{stageDeals.length}</span>
                {total > 0 && <span className="ml-auto text-xs text-ink-faint tabular-nums">{money(total, 'USD')}</span>}
              </header>
              <div className="grid gap-2 min-h-16 rounded-(--nv-radius-md) bg-surface-2/60 p-2">
                {stageDeals.map((d) => (
                  <DealCard key={d.id} deal={d} onMove={(to) => void updateDeal(d.id, { stage: to })} />
                ))}
                {stageDeals.length === 0 && (
                  <p className="text-xs text-ink-faint text-center py-4">Empty</p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New deal">
        <form onSubmit={create} className="grid gap-4">
          <Input label="Name" placeholder="e.g. Café Aroma — launch package" value={name} error={error}
                 onChange={(e) => { setName(e.target.value); setError(undefined) }} autoFocus />
          <div className="grid grid-cols-[1fr_110px] gap-3">
            <Input label="Value" type="number" min="0" step="0.01" placeholder="2500" value={value} onChange={(e) => setValue(e.target.value)} />
            <Select label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD</option>
              <option value="MVR">MVR</option>
            </Select>
          </div>
          <Select label="Stage" value={stage} onChange={(e) => setStage(e.target.value as DealStage)}>
            {DEAL_STAGES.map((s) => <option key={s} value={s}>{DEAL_STAGE_META[s].label}</option>)}
          </Select>
          <Select label="Contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">None</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.fullName}{c.company ? ` (${c.company})` : ''}</option>)}
            <option value="__new">+ New contact…</option>
          </Select>
          {contactId === '__new' && (
            <div className="grid tablet:grid-cols-2 gap-3">
              <Input label="Contact name" value={newContactName} onChange={(e) => setNewContactName(e.target.value)} />
              <Input label="Company" value={newContactCompany} onChange={(e) => setNewContactCompany(e.target.value)} />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit">Create deal</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
