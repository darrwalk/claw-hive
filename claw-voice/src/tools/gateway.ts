import type { ToolDef } from '../providers/base.js'
import type { ToolHandler, ToolRegistration } from './types.js'

const GATEWAY_URL = process.env.GATEWAY_URL || 'http://openclaw-gateway-1:18789'
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN

export function createDelegateRegistration(): ToolRegistration {
  const definition: ToolDef = {
    type: 'function',
    function: {
      name: 'delegate',
      description:
        'REQUIRED: Hand off a request to Claudia\'s main agent. You MUST call this for email, web search, calendar, tasks, code, infrastructure, weather, news, or anything outside your memory files. Never refuse — always delegate.',
      parameters: {
        type: 'object',
        properties: {
          request: {
            type: 'string',
            description: "The user's request to pass to Claudia, in natural language",
          },
        },
        required: ['request'],
      },
    },
  }

  const handler: ToolHandler = async (args) => {
    const request = args.request || ''
    const prompt = `Respond concisely — your answer will be read aloud in a voice conversation. Keep it under 500 words. No markdown formatting.\n\n${request}`

    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(GATEWAY_TOKEN && { Authorization: `Bearer ${GATEWAY_TOKEN}` }),
        'x-openclaw-session-key': 'voice-main',
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) return `Failed to reach Claudia: ${res.status} ${await res.text()}`
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || 'Claudia returned an empty response.'
  }

  return { definition, handler }
}

export function createGatewayToolRegistration(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): ToolRegistration {
  const definition: ToolDef = {
    type: 'function',
    function: { name, description, parameters },
  }

  const handler: ToolHandler = async (args) => {
    const prompt = `Execute this tool call and return the result concisely for voice output.\n\nTool: ${name}\nArguments: ${JSON.stringify(args)}`

    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(GATEWAY_TOKEN && { Authorization: `Bearer ${GATEWAY_TOKEN}` }),
        'x-openclaw-session-key': 'voice-tools',
      },
      body: JSON.stringify({
        model: 'openclaw:main',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) return `Gateway error: ${res.status}`
    const data = await res.json()
    return data.choices?.[0]?.message?.content?.trim() || 'No result.'
  }

  return { definition, handler }
}
