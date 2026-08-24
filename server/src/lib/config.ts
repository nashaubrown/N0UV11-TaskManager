import 'dotenv/config'

const req = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback
  if (v === undefined) throw new Error(`Missing required env var ${name}`)
  return v
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://localhost:4173',
  jwt: {
    secret: req('JWT_SECRET', 'dev-only-secret-change-me'),
    accessTtlSec: 60 * 15,          // 15 min
    refreshTtlSec: 60 * 60 * 24 * 30, // 30 days
  },
  storage: {
    driver: (process.env.STORAGE_DRIVER ?? 'local') as 'local' | 's3',
    localDir: process.env.STORAGE_LOCAL_DIR ?? './uploads',
    s3: {
      bucket: process.env.S3_BUCKET ?? '',
      region: process.env.S3_REGION ?? 'auto',
      endpoint: process.env.S3_ENDPOINT ?? '',       // e.g. Cloudflare R2 endpoint
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '', // CDN / r2.dev domain
    },
  },
  gdrive: {
    serviceAccountJson: process.env.GDRIVE_SERVICE_ACCOUNT_JSON ?? '',
    folderId: process.env.GDRIVE_FOLDER_ID ?? '',
    get configured() { return Boolean(this.serviceAccountJson && this.folderId) },
  },
  /** First CORS origin doubles as the web app origin for OAuth redirects. */
  get webOrigin() {
    return process.env.WEB_ORIGIN ?? (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',')[0].trim()
  },
  meta: {
    appId: process.env.META_APP_ID ?? '',
    appSecret: process.env.META_APP_SECRET ?? '',
    redirectUrl: process.env.META_REDIRECT_URL ?? 'http://localhost:4000/api/analytics/oauth/callback',
    get configured() { return Boolean(this.appId && this.appSecret) },
    // "Instagram API with Instagram Login" — merchants sign in with just
    // their IG account, no Facebook Page. Separate credentials from the
    // app's Instagram product tab.
    igAppId: process.env.IG_APP_ID ?? '',
    igAppSecret: process.env.IG_APP_SECRET ?? '',
    igRedirectUrl: process.env.IG_REDIRECT_URL ?? 'http://localhost:4000/api/analytics/oauth/instagram/callback',
    get igConfigured() { return Boolean(this.igAppId && this.igAppSecret) },
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/calendar/callback',
    get configured() { return Boolean(this.clientId && this.clientSecret) },
    // Google Picker (Drive import): browser API key + the Cloud project
    // number. Both from the same Cloud project as the OAuth client; the
    // project number makes drive.file grants from the Picker stick.
    pickerApiKey: process.env.GOOGLE_PICKER_API_KEY ?? '',
    projectNumber: process.env.GOOGLE_PROJECT_NUMBER ?? '',
  },
}
