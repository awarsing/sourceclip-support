// Reads the S3_* environment into NuxtHub s3 driver options.

type S3Env = Partial<
  Record<'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY' | 'S3_BUCKET' | 'S3_ENDPOINT' | 'S3_REGION', string>
>

export interface S3Config {
  driver: {
    accessKeyId: string
    secretAccessKey: string
    bucket: string
    region: string | undefined
    endpoint: string | undefined
  }
  // Shown in the registration log line.
  summary: string
}

function isBucketEndpoint(endpoint: string | undefined, bucket: string) {
  if (!endpoint) return false
  try {
    const hostname = new URL(endpoint).hostname
    return hostname === bucket || hostname.startsWith(`${bucket}.`)
  } catch {
    return false
  }
}

function hasCredentials(
  env: S3Env,
): env is S3Env & Record<'S3_ACCESS_KEY_ID' | 'S3_SECRET_ACCESS_KEY' | 'S3_BUCKET', string> {
  return Boolean(env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_BUCKET)
}

function summarize(bucket: string, endpoint: string | undefined, endpointIncludesBucket: boolean) {
  const endpointPart = endpoint ? `, endpoint=${endpoint}` : ''
  const bucketEndpointPart = endpointIncludesBucket ? ', bucketEndpoint=true' : ''
  return `bucket=${bucket}${endpointPart}${bucketEndpointPart}`
}

// 'unset' when the credentials or bucket are missing (S3 is simply not used).
// 'no-region' when neither a region nor an endpoint is given: NuxtHub's s3
// driver builds the URL as `https://${bucket}.s3.${region}.amazonaws.com`
// without an endpoint, so a missing region would put a literal `undefined` in
// the host.
export function resolveS3Config(env: S3Env): S3Config | 'unset' | 'no-region' {
  if (!hasCredentials(env)) return 'unset'
  const endpoint = env.S3_ENDPOINT || undefined
  const region = env.S3_REGION || undefined
  if (!endpoint && !region) return 'no-region'

  const bucket = env.S3_BUCKET
  const endpointIncludesBucket = isBucketEndpoint(endpoint, bucket)
  return {
    driver: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      bucket: endpointIncludesBucket ? '' : bucket,
      region,
      endpoint,
    },
    summary: summarize(bucket, endpoint, endpointIncludesBucket),
  }
}
