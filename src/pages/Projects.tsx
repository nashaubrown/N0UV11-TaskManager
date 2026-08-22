import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FolderKanban, Image as ImageIcon, Plus } from 'lucide-react'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { Modal } from '../components/common/Modal'
import { Input, Textarea } from '../components/common/Input'
import { ProgressBar } from '../components/common/ProgressBar'
import { projectStats, useData } from '../store/data'

export default function Projects() {
  const { projects, tasks, photos, addProject } = useData()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string>()

  const create = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Give the project a name.')
    const project = addProject({ name: name.trim(), description: description.trim() || undefined })
    setCreating(false)
    setName(''); setDescription(''); setError(undefined)
    navigate(`/projects/${project.id}`)
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Projects</h1>
        <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>New project</Button>
      </div>

      <div className="grid tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
        {projects.map((p) => {
          const stats = projectStats(p.id, tasks, photos)
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="block">
              <Card interactive padding="lg" className="h-full flex flex-col gap-3">
                <div className="size-10 rounded-(--nv-radius-md) nv-gradient-soft flex items-center justify-center text-brand-deep dark:text-brand">
                  <FolderKanban className="size-5" aria-hidden />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-ink">{p.name}</h3>
                  {p.description && <p className="text-sm text-ink-muted mt-1 line-clamp-2">{p.description}</p>}
                </div>
                <div className="mt-auto grid gap-2">
                  <ProgressBar
                    value={stats.completedTaskCount}
                    max={stats.taskCount}
                    label={`${stats.completedTaskCount}/${stats.taskCount} tasks`}
                  />
                  <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                    <ImageIcon className="size-3.5" aria-hidden /> {stats.photoCount} photos
                  </span>
                </div>
              </Card>
            </Link>
          )
        })}
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New project">
        <form onSubmit={create} className="grid gap-4">
          <Input
            label="Name"
            placeholder="e.g. Café Aroma Launch"
            value={name}
            error={error}
            onChange={(e) => { setName(e.target.value); setError(undefined) }}
            autoFocus
          />
          <Textarea label="Description" placeholder="What is this project about?" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit">Create project</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
