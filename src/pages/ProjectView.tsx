import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useRef } from 'react'
import { ArrowLeft, Plus, Upload } from 'lucide-react'
import { Tabs } from '../components/common/Tabs'
import { Card, CardHeader } from '../components/common/Card'
import { ProgressBar } from '../components/common/ProgressBar'
import { TaskList } from '../components/task/TaskList'
import { PhotoGallery } from '../components/photo/PhotoGallery'
import { PhotoViewer } from '../components/photo/PhotoViewer'
import { ApprovalWorkflow } from '../components/approval/ApprovalWorkflow'
import { projectStats, useData } from '../store/data'
import { TaskDetail } from '../components/task/TaskDetail'
import { TaskForm, type TaskFormValues } from '../components/task/TaskForm'
import { Modal } from '../components/common/Modal'
import { EmptyState } from '../components/common/EmptyState'
import { Button } from '../components/common/Button'

type Tab = 'tasks' | 'photos' | 'approvals'

export default function ProjectView() {
  const { projectId } = useParams()
  const { projects, tasks, photos, approvals, addTask, addPhotos } = useData()
  const project = projects.find((p) => p.id === projectId)
  const [tab, setTab] = useState<Tab>('tasks')
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [creatingTask, setCreatingTask] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const createTask = (values: TaskFormValues) => {
    addTask({ ...values, projectId })
    setCreatingTask(false)
  }

  const ingest = (list: FileList | null) => {
    if (!list) return
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    if (images.length) addPhotos(images, { projectId })
  }

  const projectTasks = useMemo(() => tasks.filter((t) => t.projectId === projectId), [tasks, projectId])
  const projectPhotos = useMemo(() => photos.filter((p) => p.projectId === projectId), [photos, projectId])
  const stats = projectStats(projectId ?? '', tasks, photos)
  const projectApprovals = useMemo(
    () => approvals.filter((a) => projectPhotos.some((p) => p.id === a.photoId)),
    [approvals, projectPhotos],
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

      {tab === 'tasks' && (
        <div className="grid gap-3">
          <div className="flex justify-end">
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreatingTask(true)}>
              New task
            </Button>
          </div>
          <TaskList tasks={projectTasks} onSelect={(t) => setOpenTaskId(t.id)} />
        </div>
      )}
      <TaskDetail taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
      <Modal open={creatingTask} onClose={() => setCreatingTask(false)} title={`New task in ${project.name}`} size="lg">
        <TaskForm onSubmit={createTask} onCancel={() => setCreatingTask(false)} />
      </Modal>
      {tab === 'photos' && (
        <div className="grid gap-3">
          <div className="flex justify-end">
            <Button size="sm" icon={<Upload className="size-4" />} onClick={() => fileInput.current?.click()}>
              Upload
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => { ingest(e.target.files); e.target.value = '' }}
            />
          </div>
          <PhotoGallery
            photos={projectPhotos}
            onOpen={(p) => setViewerIndex(projectPhotos.findIndex((x) => x.id === p.id))}
          />
          <PhotoViewer photos={projectPhotos} index={viewerIndex} onClose={() => setViewerIndex(null)} onNavigate={setViewerIndex} />
        </div>
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
