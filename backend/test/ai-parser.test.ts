import assert from 'node:assert/strict'
import test from 'node:test'
import type { RawMessage } from '../src/data/raw-message-repository.js'
import { AIParserService } from '../src/ai/ai-parser-service.js'
import type { AIProvider } from '../src/ai/ai-provider.js'
import { DeepSeekProvider } from '../src/ai/deepseek-provider.js'
import { buildPrompt, parseAnalysis } from '../src/ai/message-parser.js'

const sentAt = Date.parse('2026-09-22T10:00:00+08:00') / 1_000

function message(content: string): RawMessage {
  return {
    source: 'qq',
    sourceMessageId: 'message-1',
    conversationId: 'group-1',
    senderId: 'sender-1',
    senderName: null,
    content,
    sentAt,
    rawPayload: '{}',
  }
}

const cases = [
  {
    name: 'task',
    content: '人工智能导论第三章作业周五23:59前提交学习通',
    output: {
      kind: 'task',
      title: '人工智能导论第三章作业',
      course: '人工智能导论',
      deadline: '2026-09-25T23:59:00+08:00',
      eventTime: null,
      location: null,
      description: '提交至学习通',
    },
  },
  {
    name: 'event',
    content: '明天下午两点在信息楼302开班会',
    output: {
      kind: 'event',
      title: '班会',
      course: null,
      deadline: null,
      eventTime: '2026-09-23T14:00:00+08:00',
      location: '信息楼302',
      description: null,
    },
  },
  {
    name: 'irrelevant',
    content: '今天食堂二楼麻辣香锅八折',
    output: {
      kind: 'irrelevant',
      title: '食堂优惠',
      course: null,
      deadline: null,
      eventTime: null,
      location: null,
      description: null,
    },
  },
  {
    name: 'incomplete information',
    content: '记得把报告交一下',
    output: {
      kind: 'task',
      title: '提交报告',
      course: null,
      deadline: null,
      eventTime: null,
      location: null,
      description: null,
    },
  },
] as const

for (const testCase of cases) {
  test(`AIParserService parses the ${testCase.name} case`, async () => {
    let receivedPrompt = ''
    const provider: AIProvider = {
      async generate(prompt) {
        receivedPrompt = prompt
        return JSON.stringify(testCase.output)
      },
    }

    const result = await new AIParserService(provider).analyse(message(testCase.content))

    assert.deepEqual(result, testCase.output)
    assert.match(receivedPrompt, new RegExp(testCase.content))
    assert.match(receivedPrompt, /2026-09-22T10:00:00\.000\+08:00/)
  })
}

test('buildPrompt includes available sender metadata without inventing a group name', () => {
  const rawMessage = message('测试消息')
  rawMessage.senderName = '张同学'

  const prompt = buildPrompt(rawMessage)

  assert.match(prompt, /QQ 群名：未提供/)
  assert.match(prompt, /发送者：张同学/)
  assert.match(prompt, /发送者 ID：sender-1/)
})

test('buildPrompt treats cafeteria promotions as irrelevant', () => {
  const prompt = buildPrompt(message('今天食堂二楼麻辣香锅八折'))

  assert.match(prompt, /食堂促销、商品折扣.*通常判为 irrelevant/)
  assert.match(prompt, /“今天食堂二楼麻辣香锅八折” → irrelevant/)
})

test('buildPrompt keeps submission platforms out of location', () => {
  const prompt = buildPrompt(message('请将作业提交到学习通'))

  assert.match(prompt, /location 仅表示课程、会议、活动等实际发生的地点/)
  assert.match(prompt, /学习通、雨课堂、邮箱、网盘.*不能填写到 location，应放入 description/)
})

test('DeepSeekProvider requests enough tokens and rejects empty content', async () => {
  const originalFetch = globalThis.fetch
  let requestBody: unknown

  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body))
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '   ' } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    await assert.rejects(
      new DeepSeekProvider('test-key').generate('test prompt'),
      /DeepSeek 返回了空的模型内容/,
    )
    assert.deepEqual(requestBody, {
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: 'test prompt' }],
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      max_tokens: 1_000,
      stream: false,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('parseAnalysis rejects invalid JSON', () => {
  assert.throws(() => parseAnalysis('not JSON'), /AI 返回内容不是有效 JSON/)
})

test('parseAnalysis rejects a schema mismatch', () => {
  assert.throws(
    () => parseAnalysis('{"kind":"unknown"}'),
    /AI 返回内容不符合 MessageAnalysis Schema/,
  )
})
