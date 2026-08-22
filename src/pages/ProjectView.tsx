import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useRef } from 'react'
import { ArrowLeft, Check, Copy, Plus, Share2, Upload } from 'lucide-react'
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
import { Input } from '../components/common/Input'
import { api, DEMO } from '../services/api'
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
  const [sharing, setSharing] = useState(false)
  const [shareLabel, setShareLabel] = useState('')
  const [shareUrl, setShareUrl] = useState<string>()
  const [shareError, setShareError] = useState<string>()
  const [copied, setCopied] = useState(false)

  const createShareLink = async () => {
    setShareError(undefined)
    if (DEMO) { setShareUrl(`${window.location.origin}/portal/demo`); return }
    try {
      const link = await api<{ path: string }>('POST', '/share-links', {
        projectId,
        label: shareLabel.trim() || undefined,
        canComment: true,
        canApprove: true,
        expiresInDays: 30,
      })
      setShareUrl(`${window.location.origin}${link.path}`)
    } catch (e) {
      setShareError(e instanceof Error ? e.message : 'Could not create the link')
    }
  }
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
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="font-display font-bold text-2xl text-ink">{project.name}</h1>
          <Button variant="secondary" size="sm" icon={<Share2 className="size-4" />} onClick={() => setSharing(true)}>
            Share for review
          </Button>
        </div>
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

      <Modal open={sharing} onClose={() => { setSharing(false); setShareUrl(undefined); setCopied(false) }} title="Share for client review">
        {shareUrl ? (
          <div className="grid gap-3">
            <p className="text-sm text-ink-2">
              Anyone with this link can view the project's photos, approve or reject them, and comment — no account needed. It expires in 30 days.
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareUrl}
                aria-label="Review link"
                className="flex-1 h-10 rounded-(--nv-radius-md) border border-border bg-surface-2 text-ink px-3 text-sm font-mono"
                onFocus={(e) => e.target.select()}
              />
              <Button
                icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                onClick={() => { void navigator.clipboard.writeText(shareUrl).then(() => setCopied(true)) }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="text-xs text-ink-muted">This link is shown once — copy it now. You can revoke it later from the API.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <Input
              label="Client name (optional)"
              placeholder="e.g. Café Aroma"
              value={shareLabel}
              onChange={(e) => setShareLabel(e.target.value)}
              hint="Shown on the portal and in the audit trail."
            />
            {shareError && <p role="alert" className="text-sm text-error">{shareError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSharing(false)}>Cancel</Button>
              <Button icon={<Share2 className="size-4" />} onClick={() => void createShareLink()}>Create link</Button>
            </div>
          </div>
        )}
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
