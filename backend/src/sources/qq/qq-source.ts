import WebSocket, { type RawData } from 'ws'
import type { RawMessage } from '../../data/raw-message-repository.js'

const DEFAULT_NAPCAT_URL = 'ws://127.0.0.1:3002'
const RECONNECT_DELAY_MS = 5_000

type JsonObject = Record<string, unknown>

type QqSourceOptions = {
  allowedGroupIds: ReadonlySet<string>
  saveRawMessage: (message: RawMessage) => boolean
  url?: string
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rawDataToText(data: RawData) {
  if (typeof data === 'string') return data
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  return Buffer.concat(data).toString('utf8')
}

function externalIdToString(value: unknown) {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return null
}

function toRawMessage(event: JsonObject, rawPayload: string): RawMessage | null {
  const sender = isJsonObject(event.sender) ? event.sender : {}
  const card = typeof sender.card === 'string' ? sender.card.trim() : ''
  const nickname = typeof sender.nickname === 'string' ? sender.nickname.trim() : ''
  const sourceMessageId = externalIdToString(event.message_id)
  const conversationId = externalIdToString(event.group_id)
  const senderId = externalIdToString(event.user_id)

  if (
    sourceMessageId === null ||
    conversationId === null ||
    senderId === null ||
    typeof event.raw_message !== 'string' ||
    typeof event.time !== 'number' ||
    !Number.isFinite(event.time)
  ) {
    return null
  }

  return {
    source: 'qq',
    sourceMessageId,
    conversationId,
    senderId,
    senderName: card || nickname || null,
    content: event.raw_message,
    sentAt: event.time,
    rawPayload,
  }
}

function handleMessage(data: RawData, options: QqSourceOptions) {
  const rawPayload = rawDataToText(data)
  let event: unknown

  try {
    event = JSON.parse(rawPayload)
  } catch {
    console.warn('[QQ] 忽略无法解析的 WebSocket 消息')
    return
  }

  if (!isJsonObject(event)) return
  if (event.post_type !== 'message' || event.message_type !== 'group') return

  const groupId = externalIdToString(event.group_id)
  if (groupId === null) {
    console.warn('[QQ] 忽略 group_id 不合法的群消息')
    return
  }

  if (!options.allowedGroupIds.has(groupId)) {
    console.info('[QQ] 非白名单群消息已忽略')
    return
  }

  console.info('[QQ] 白名单群消息已进入处理流程')

  const message = toRawMessage(event, rawPayload)
  if (message === null) {
    console.warn('[QQ] 忽略字段不完整的群消息')
    return
  }

  try {
    const saved = options.saveRawMessage(message)
    if (!saved) console.debug('[QQ] 忽略重复的白名单群消息')
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error)
    console.error(`[QQ] 保存群消息失败: ${messageText}`)
    return
  }

  console.info('[QQ] 白名单群消息处理完成')
}

export function createQqSource(options: QqSourceOptions) {
  const url = options.url ?? DEFAULT_NAPCAT_URL
  let socket: WebSocket | undefined
  let reconnectTimer: NodeJS.Timeout | undefined
  let stopped = true
  let connected = false
  let lastErrorMessage = ''

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer !== undefined) return

    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined
      connect()
    }, RECONNECT_DELAY_MS)
    reconnectTimer.unref()
  }

  const connect = () => {
    if (stopped) return

    const nextSocket = new WebSocket(url)
    socket = nextSocket

    nextSocket.on('open', () => {
      connected = true
      lastErrorMessage = ''
      console.info('[QQ] NapCat WebSocket connected')
    })

    nextSocket.on('message', (data) => handleMessage(data, options))

    nextSocket.on('close', () => {
      if (socket === nextSocket) socket = undefined
      if (connected) console.info('[QQ] NapCat WebSocket disconnected')
      connected = false
      scheduleReconnect()
    })

    nextSocket.on('error', (error) => {
      if (error.message === lastErrorMessage) return
      lastErrorMessage = error.message
      console.error(`[QQ] NapCat WebSocket error: ${error.message}`)
    })
  }

  return {
    start() {
      if (!stopped) return
      stopped = false
      connect()
    },

    async stop() {
      stopped = true
      if (reconnectTimer !== undefined) {
        clearTimeout(reconnectTimer)
        reconnectTimer = undefined
      }

      const currentSocket = socket
      socket = undefined
      if (currentSocket === undefined || currentSocket.readyState === WebSocket.CLOSED) return

      await new Promise<void>((resolve) => {
        currentSocket.once('close', resolve)

        if (currentSocket.readyState === WebSocket.OPEN) {
          currentSocket.close()
        } else {
          currentSocket.terminate()
        }
      })
    },
  }
}
