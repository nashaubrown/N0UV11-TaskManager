import { Handshake, Plus } from 'lucide-react'
import { Button } from '../components/common/Button'
import { EmptyState } from '../components/common/EmptyState'

/** Placeholder — CRM pipeline lands in Phase 2 with the deals API. */
export default function Deals() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-bold text-2xl text-ink">Deals</h1>
        <Button icon={<Plus className="size-4" />} disabled>New deal</Button>
      </div>
      <EmptyState
        icon={<Handshake />}
        title="Pipeline arrives in Phase 2"
        description="Deal stages, contacts, and photo/task links are already modeled in the database schema — the UI hooks up when the API exists."
      />
    </div>
  )
}
