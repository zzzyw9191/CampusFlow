import type { RawMessage } from '../data/raw-message-repository.js'
import { AIParserService } from '../ai/ai-parser-service.js'
import { DeepSeekProvider } from '../ai/deepseek-provider.js'

const contents = [
  '人工智能导论第三章作业周五23:59前提交学习通',
  '明天下午两点在信息楼302开班会',
  '今天食堂二楼麻辣香锅八折',
  '记得把报告交一下',
]

const parser = new AIParserService(new DeepSeekProvider())
const sentAt = Math.floor(Date.now() / 1_000)

for (const [index, content] of contents.entries()) {
  const message: RawMessage = {
    source: 'qq',
    sourceMessageId: `manual-test-${index + 1}`,
    conversationId: 'manual-test-group',
    senderId: 'manual-test-sender',
    senderName: '测试用户',
    content,
    sentAt,
    rawPayload: '{}',
  }

  const analysis = await parser.analyse(message)
  console.log(content)
  console.log(analysis)
}
