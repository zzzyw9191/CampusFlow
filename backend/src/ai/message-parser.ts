import type { RawMessage } from '../data/raw-message-repository.js'
import { messageAnalysisSchema, type MessageAnalysis } from './message-analysis.js'

const CHINA_TIME_OFFSET_SECONDS = 8 * 60 * 60

function formatMessageTime(sentAt: number) {
  return new Date((sentAt + CHINA_TIME_OFFSET_SECONDS) * 1_000)
    .toISOString()
    .replace('Z', '+08:00')
}

export function buildPrompt(message: RawMessage): string {
  const sender = message.senderName ?? '未提供'

  return `你是 CampusFlow 的校园信息解析器。请分析下面这一条原始消息，并只返回一个 JSON 对象。

分类只能是 notification、task、event、irrelevant：
- task：需要用户完成的待办事项，例如作业、报告、填表、提交等。
- event：有明确发生时间的日程或活动，例如班会、上课、实验、讲座、考试等。
- notification：与课程、考试、学校行政、正式校园事务、重要校园服务变更等相关，值得用户持续关注的信息。
- irrelevant：虽然可能是校园内消息，但对 CampusFlow 的任务、日程、学习或正式校园事务管理没有明显价值。

分类优先级为：明确待办 → task；否则明确日程事件 → event；否则有上述正式信息价值 → notification；否则 → irrelevant。

食堂促销、商品折扣、广告、闲聊、娱乐讨论、拼单、二手交易和无管理价值的普通聊天通常判为 irrelevant。
例如：“今天食堂二楼麻辣香锅八折” → irrelevant。

必须严格返回以下 JSON 结构，不能返回 Markdown、代码块、解释或额外字段：
{
  "kind": "notification | task | event | irrelevant",
  "title": "简洁标题",
  "course": "课程名或 null",
  "deadline": "ISO 8601 时间或 null",
  "eventTime": "ISO 8601 时间或 null",
  "location": "地点或 null",
  "description": "补充说明或 null"
}

规则：
- title 必须是字符串；其余无法从消息中确定的字段必须返回 null。
- 禁止猜测原消息和元数据中不存在的信息。
- deadline 只用于 task 的截止时间；eventTime 只用于 event 的发生时间。
- location 仅表示课程、会议、活动等实际发生的地点。学习通、雨课堂、邮箱、网盘等提交平台或渠道不能填写到 location，应放入 description。
- 时间尽量解析为带时区的 ISO 8601 格式。
- “今天、明天、后天、本周五、下周一”等相对时间，必须以原始消息时间为基准计算，不能使用你自己的当前时间。
- 原始消息时间采用中国标准时间（UTC+08:00）。

原始消息：
- 正文：${message.content}
- 消息时间：${formatMessageTime(message.sentAt)}
- 来源：${message.source}
- QQ 群名：未提供
- QQ 群 ID：${message.conversationId}
- 发送者：${sender}
- 发送者 ID：${message.senderId}`
}

export function parseAnalysis(output: string): MessageAnalysis {
  let parsed: unknown

  try {
    parsed = JSON.parse(output)
  } catch (error) {
    throw new Error('AI 返回内容不是有效 JSON', { cause: error })
  }

  const result = messageAnalysisSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`AI 返回内容不符合 MessageAnalysis Schema：${result.error.message}`)
  }

  return result.data
}
