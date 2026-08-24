import { api } from './api'
import type { Photo } from '../types'

/* Google Drive import via the Google Picker. The server hands us the user's
 * OAuth token (drive.file scope) plus Picker credentials; the Picker grants
 * NOUVII access to exactly the files the user selects; the server then
 * downloads them straight into the normal photo pipeline. */

export interface DriveConfig {
  configured: boolean
  connected: boolean
  hasDriveScope?: boolean
  accessToken?: string
  apiKey?: string
  appId?: string
}

export interface DrivePick {
  id: string
  name?: string
  mimeType?: string
}

export const driveConfig = () => api<DriveConfig>('GET', '/photos/import/drive/config')

export const importDrivePhotos = (files: DrivePick[], merchantId?: string) =>
  api<{ items: Photo[]; failed: { id: string; name?: string; reason: string }[] }>(
    'POST', '/photos/import/drive', { files, merchantId },
  )

/* eslint-disable @typescript-eslint/no-explicit-any */
let pickerLoaded: Promise<void> | null = null
const loadPickerApi = () => {
  pickerLoaded ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://apis.google.com/js/api.js'
    s.async = true
    s.onload = () => (window as any).gapi.load('picker', { callback: () => resolve() })
    s.onerror = () => { pickerLoaded = null; reject(new Error('Could not load the Google Picker')) }
    document.head.appendChild(s)
  })
  return pickerLoaded
}

/** Open the Picker; resolves with the chosen image files ([] on cancel). */
export async function pickDrivePhotos(cfg: DriveConfig): Promise<DrivePick[]> {
  if (!cfg.accessToken) return []
  await loadPickerApi()
  const g = (window as any).google
  return new Promise((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS_IMAGES).setIncludeFolders(true)
    let builder = new g.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(cfg.accessToken)
      .enableFeature(g.picker.Feature.MULTISELECT_ENABLED)
      .setTitle('Pick photos to import into NOUVII')
      .setCallback((data: any) => {
        if (data.action === g.picker.Action.PICKED) {
          resolve((data.docs ?? []).map((d: any) => ({ id: d.id, name: d.name, mimeType: d.mimeType })))
        } else if (data.action === g.picker.Action.CANCEL) {
          resolve([])
        }
      })
    if (cfg.apiKey) builder = builder.setDeveloperKey(cfg.apiKey)
    if (cfg.appId) builder = builder.setAppId(cfg.appId)
    builder.build().setVisible(true)
  })
}
