import { readFileSync } from 'node:fs'

type JsonObject = Record<string, unknown>

export type QqSourceConfig = {
  allowedGroupIds: ReadonlySet<string>
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function emptyConfig(): QqSourceConfig {
  return { allowedGroupIds: new Set<string>() }
}

export function loadQqSourceConfig(configPath?: string): QqSourceConfig {
  if (configPath === undefined) {
    console.warn('[QQ] 未指定白名单配置，当前不接收任何群消息')
    return emptyConfig()
  }

  let configText: string
  try {
    configText = readFileSync(configPath, 'utf8')
  } catch {
    console.warn('[QQ] 白名单配置不存在或无法读取，当前不接收任何群消息')
    return emptyConfig()
  }

  let config: unknown
  try {
    config = JSON.parse(configText)
  } catch {
    console.warn('[QQ] 白名单配置不是有效的 JSON，当前不接收任何群消息')
    return emptyConfig()
  }

  if (
    !isJsonObject(config) ||
    !Array.isArray(config.allowedGroupIds) ||
    !config.allowedGroupIds.every(
      (groupId) => typeof groupId === 'string' && /^\d+$/.test(groupId),
    )
  ) {
    console.warn('[QQ] allowedGroupIds 配置不合法，当前不接收任何群消息')
    return emptyConfig()
  }

  const allowedGroupIds = new Set(config.allowedGroupIds)
  if (allowedGroupIds.size === 0) {
    console.info('[QQ] 白名单为空，当前不接收任何群消息')
  } else {
    console.info(`[QQ] 已加载 ${allowedGroupIds.size} 个允许群`)
  }

  return { allowedGroupIds }
}
