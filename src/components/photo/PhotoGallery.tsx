import { ImageIcon } from 'lucide-react'
import type { Photo } from '../../types'
import { PhotoCard } from './PhotoCard'
import { EmptyState } from '../common/EmptyState'
import { useUi } from '../../store/ui'

export function PhotoGallery({ photos, onOpen, selectable = true, large = false, onDragStartPhoto, onDragEndPhoto }: {
  photos: Photo[]
  onOpen?: (photo: Photo) => void
  selectable?: boolean
  /** fewer columns → bigger tiles */
  large?: boolean
  onDragStartPhoto?: (id: string) => void
  onDragEndPhoto?: () => void
}) {
  const { selectedPhotoIds, togglePhotoSelection } = useUi()

  if (photos.length === 0) {
    return (
      <EmptyState
        icon={<ImageIcon />}
        title="No photos yet"
        description="Uploads will appear here as a responsive gallery with approval status at a glance."
      />
    )
  }

  return (
    <div className={large
      ? 'grid gap-3 grid-cols-2 tablet:grid-cols-2 desktop:grid-cols-3 wide:grid-cols-4'
      : 'grid gap-3 grid-cols-2 tablet:grid-cols-3 desktop:grid-cols-4 wide:grid-cols-5'}>
      {photos.map((p) => (
        <PhotoCard
          key={p.id}
          photo={p}
          selected={selectedPhotoIds.includes(p.id)}
          onOpen={onOpen}
          onToggleSelect={selectable ? togglePhotoSelection : undefined}
          onDragStartPhoto={onDragStartPhoto}
          onDragEndPhoto={onDragEndPhoto}
        />
      ))}
    </div>
  )
}
