import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Tabs } from '../components/common/Tabs'
import { Card, CardHeader } from '../components/common/Card'
import { ProgressBar } from '../components/common/ProgressBar'
import { TaskList } from '../components/task/TaskList'
import { PhotoGallery } from '../components/photo/PhotoGallery'
import { PhotoViewer } from '../components/photo/PhotoViewer'
import { ApprovalWorkflow } from '../components/approval/ApprovalWorkflow'
import { approvals } from '../mocks/data'
import { projectStats, useData } from '../store/data'
import { TaskDetail } from '../components/task/TaskDetail'
import { EmptyState } from '../components/common/EmptyState'
import { Button } from '../components/common/Button'

type Tab = 'tasks' | 'photos' | 'approvals'

export default function ProjectView() {
  const { projectId } = useParams()
  const { projects, tasks, photos } = useData()
  const project = projects.find((p) => p.id === projectId)
  const [tab, setTab] = useState<Tab>('tasks')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId])
  const projectPhotos = useMemo(() => photos.filter((p) => p.projectId === projectId), [photos, projectId])
  const stats = projectStats(projectId ?? '', tasks, photos)
  const projectApprovals = useMemo(
    () => approvals.filter((a) => projectPhotos.some((p) => p.id === a.photoId)),
    [projectPhotos],
  )

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="It may have been archived or removed."
        action={<Button variant="secondary" onClick={() => history.back()}>Go back</Button>}
      />
    )
  }

  return (
    <div className="grid gap-5">
      <div>
        <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink mb-2">
          <ArrowLeft className="size-4" aria-hidden /> Projects
        </Link>
        <h1 className="font-display font-bold text-2xl text-ink">{project.name}</h1>
        {project.description && <p className="text-ink-muted mt-1">{project.description}</p>}
        <ProgressBar
          className="mt-3 max-w-sm"
          value={stats.completedTaskCount}
          max={stats.taskCount}
          label={`${stats.completedTaskCount}/${stats.taskCount} tasks`}
        />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        items={[
          { value: 'tasks', label: 'Tasks', count: projectTasks.length },
          { value: 'photos', label: 'Photos', count: projectPhotos.length },
          { value: 'approvals', label: 'Approvals', count: projectApprovals.length },
        ]}
      />

      {tab === 'tasks' && <TaskList tasks={projectTasks} onSelect={(t) => setOpenTaskId(t.id)} />}
      <TaskDetail taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      {tab === 'photos' && (
        <>
          <PhotoGallery
            photos={projectPhotos}
            onOpen={(p) => setViewerIndex(projectPhotos.findIndex((x) => x.id === p.id))}
          />
          <PhotoViewer photos={projectPhotos} index={viewerIndex} onClose={() => setViewerIndex(null)} onNavigate={setViewerIndex} />
        </>
      )}
      {tab === 'approvals' && (
        projectApprovals.length === 0 ? (
          <EmptyState title="No approval requests" description="Submit a photo for approval to start a workflow." />
        ) : (
          <div className="grid tablet:grid-cols-2 gap-4">
            {projectApprovals.map((a) => {
              const photo = projectPhotos.find((p) => p.id === a.photoId)
              return (
                <Card key={a.id} padding="lg">
                  <CardHeader
                    title={photo?.title ?? 'Photo'}
                    subtitle={`Requested by ${a.requestedBy?.fullName ?? 'Unknown'}`}
                  />
                  {photo && (
                    <img src={photo.thumbUrl} alt={photo.title ?? ''} className="rounded-(--nv-radius-md) w-full aspect-video object-cover mb-4" />
                  )}
                  <ApprovalWorkflow request={a} />
                </Card>
              )
            })}
          </div>
        )
      )}
    </div>
  )
}
