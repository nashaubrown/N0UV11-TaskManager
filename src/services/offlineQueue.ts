/* Offline photo upload queue backed by IndexedDB. When an upload fails
 * because the network is down, the file is stored locally and retried when
 * connectivity returns (online event + app start). */

const DB_NAME = 'nouvii-offline'
const STORE = 'pending-uploads'

export interface PendingUpload {
  id: string
  file: Blob
  fileName: string
  contentType: string
  projectId?: string
  merchantId?: string
  queuedAt: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const tx = async (mode: IDBTransactionMode) => (await openDb()).transaction(STORE, mode).objectStore(STORE)

const asPromise = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })

export async function enqueueUpload(item: Omit<PendingUpload, 'id' | 'queuedAt'>): Promise<void> {
  const store = await tx('readwrite')
  await asPromise(store.add({ ...item, id: `up-${Date.now()}-${Math.random().toString(36).slice(2)}`, queuedAt: new Date().toISOString() }))
}

export async function listPending(): Promise<PendingUpload[]> {
  try {
    const store = await tx('readonly')
    return await asPromise(store.getAll() as IDBRequest<PendingUpload[]>)
  } catch {
    return []
  }
}

export async function removePending(id: string): Promise<void> {
  const store = await tx('readwrite')
  await asPromise(store.delete(id))
}

/** Flush the queue through the provided uploader; stops at the first failure
 *  (still offline). Returns how many uploads succeeded. */
export async function flushQueue(
  upload: (item: PendingUpload) => Promise<void>,
): Promise<number> {
  const pending = await listPending()
  let done = 0
  for (const item of pending) {
    try {
      await upload(item)
      await removePending(item.id)
      done++
    } catch {
      break
    }
  }
  return done
}
