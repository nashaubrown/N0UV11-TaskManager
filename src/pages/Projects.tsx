import { Link } from 'react-router-dom'
import { FolderKanban, Image as ImageIcon, Plus } from 'lucide-react'
import { Button } from '../components/common/Button'
import { Card } from '../components/common/Card'
import { ProgressBar } from '../components/common/ProgressBar'
import { projects } from '../mocks/data'

export default function Projects() {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="font-display font-bold text-2xl text-ink">Projects</h1>
        <Button icon={<Plus className="size-4" />}>New project</Button>
      </div>

      <div className="grid tablet:grid-cols-2 desktop:grid-cols-3 gap-4">
        {projects.map((p) => (
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
                  value={p.completedTaskCount}
                  max={p.taskCount}
                  label={`${p.completedTaskCount}/${p.taskCount} tasks`}
                />
                <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                  <ImageIcon className="size-3.5" aria-hidden /> {p.photoCount} photos
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
