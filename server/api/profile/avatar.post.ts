import type { H3Event } from 'h3'
import {
  AVATAR_MAX_BYTES,
  AVATAR_MAX_EDGE,
  AvatarValidationError,
  inspectAvatar,
} from '#layers/feedlog/shared/utils/avatar'

// Account avatars are shared across organizations. Keep their keys user-scoped.
export default defineEventHandler(async (event) => {
  const { user } = await requireLocalSession(event)
  if (Number(getHeader(event, 'content-length')) > AVATAR_MAX_BYTES) throw avatarTooLarge()

  const bytes = await readAvatarBytes(event)
  const metadata = inspectAvatarUpload(bytes)

  const uploadPrefix =
    process.env.UPLOAD_PREFIX || process.env.NUXT_PUBLIC_UPLOAD_PREFIX || useRuntimeConfig().public.uploadPrefix
  const file = await blobStorage.put(`avatar.${metadata.type}`, new Blob([bytes], { type: metadata.mime }), {
    addRandomSuffix: true,
    prefix: `${uploadPrefix}/avatars/${encodeURIComponent(user.id)}/`,
  })
  return { key: file.pathname }
})

function avatarTooLarge() {
  return createError({ statusCode: 413, message: 'Avatar exceeds 5 MB', data: { code: 'imageTooLarge' } })
}

// The request body, refused as soon as it passes the avatar size cap.
async function readAvatarBytes(event: H3Event): Promise<Uint8Array<ArrayBuffer>> {
  const reader = getRequestWebStream(event)?.getReader()
  if (!reader) throw createError({ statusCode: 400, message: 'Image required' })

  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      size += chunk.value.byteLength
      if (size > AVATAR_MAX_BYTES) {
        await reader.cancel()
        throw avatarTooLarge()
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

// A supported image no larger than the edge cap; anything else is a 400 with the
// validation code the client translates.
function inspectAvatarUpload(bytes: Uint8Array) {
  try {
    const metadata = inspectAvatar(bytes)
    if (metadata.width > AVATAR_MAX_EDGE || metadata.height > AVATAR_MAX_EDGE) {
      throw new AvatarValidationError('imageTooManyPixels')
    }
    return metadata
  } catch (error) {
    if (!(error instanceof AvatarValidationError)) throw error
    throw createError({ statusCode: 400, message: 'Invalid avatar', data: { code: error.code } })
  }
}
