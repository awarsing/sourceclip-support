import { inboxRoute, parseInbox } from '../../../../../lib/inbox/http'
import { replyInput } from '../../../../../../shared/inbox/schemas'
import { staffCommand } from '../../../../../lib/inbox/service'
import { deliverReplyNow } from '../../../../../lib/inbox/email'
export default inboxRoute(async ({ event, runtime, orgId, userId, id }) => {
  const input = parseInbox(replyInput, await readBody(event))
  await assertReplyImages(event, runtime.pool, orgId, id, input.content.parts)
  const result = await staffCommand(runtime, id, orgId, userId, { ...input, action: 'reply' })
  setResponseStatus(event, result.replayed ? 200 : 201)
  const email = input.notifyByEmail
    ? await deliverReplyNow(runtime, orgId, id, result.item.id)
    : await findReplyEmailState(runtime.pool, result.item.id)
  return { ...result, email }
})
