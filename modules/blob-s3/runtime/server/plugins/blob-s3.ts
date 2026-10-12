// S3-compatible blob provider — registers when S3_* env vars are set.
// Uses NuxtHub's own driver factory so behavior is identical to a
// build-time-baked S3 image. Falls back to the nuxthub default
// (registered by feedlog's main blob.ts plugin) when S3_* are absent.

import { createBlobStorage } from '@nuxthub/core/blob'
import { createDriver } from '@nuxthub/core/blob/drivers/s3'
import { consola } from 'consola'
import { resolveS3Config } from '../utils/s3-config'

const logger = consola.withTag('blob')

export default defineNitroPlugin(() => {
  const config = resolveS3Config(process.env)
  if (config === 'unset') return
  if (config === 'no-region') {
    logger.warn('S3 disabled: set S3_REGION (for AWS) or S3_ENDPOINT (for R2/MinIO/OSS)')
    return
  }

  registerBlobProvider({ name: 's3', storage: createBlobStorage(createDriver(config.driver)) })
  logger.info(`Registered blob provider: s3 (${config.summary})`)
})
