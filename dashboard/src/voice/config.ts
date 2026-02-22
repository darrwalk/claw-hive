export interface ProviderConfig {
  url: string
  apiKey: string
  model: string
  voice: string
  protocol: 'openai' | 'gemini'
}

interface ProviderDef {
  url: string
  keyEnv: string
  model: string
  voice: string
  protocol: 'openai' | 'gemini'
}

const PROVIDER_DEFS: Record<string, ProviderDef> = {
  grok: {
    url: 'wss://api.x.ai/v1/realtime',
    keyEnv: 'XAI_API_KEY',
    model: 'grok-3-fast',
    voice: 'Sage',
    protocol: 'openai',
  },
  openai: {
    url: 'wss://api.openai.com/v1/realtime',
    keyEnv: 'OPENAI_API_KEY',
    model: 'gpt-4o-realtime-preview',
    voice: 'sage',
    protocol: 'openai',
  },
  gemini: {
    url: 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent',
    keyEnv: 'GOOGLE_API_KEY',
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    voice: 'Kore',
    protocol: 'gemini',
  },
}

export const WORKSPACE_DIR = process.env.WORKSPACE_PATH || '/app/workspace'

export function getProvider(name: string): ProviderConfig {
  const def = PROVIDER_DEFS[name]
  if (!def) throw new Error(`Unknown provider: ${name}`)
  return {
    url: def.url,
    apiKey: process.env[def.keyEnv] || '',
    model: def.model,
    voice: def.voice,
    protocol: def.protocol,
  }
}

export function availableProviders(): { name: string; available: boolean; protocol: string }[] {
  return Object.entries(PROVIDER_DEFS).map(([name, def]) => ({
    name,
    available: !!process.env[def.keyEnv],
    protocol: def.protocol,
  }))
}
