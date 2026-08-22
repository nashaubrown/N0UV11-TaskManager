import 'dotenv/config'

const req = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback
  if (v === undefined) throw new Error(`Missing required env var ${name}`)
  return v
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 4000),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
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
      region: process.env.S3_REGION ?? 'us-east-1',
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? '', // CloudFront domain
    },
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:4000/api/calendar/callback',
    get configured() { return Boolean(this.clientId && this.clientSecret) },
  },
}
