export interface AudioEvent {
  kind: 'audio'
  audioB64: string
}

export interface TranscriptEvent {
  kind: 'transcript'
  text: string
  role: 'user' | 'assistant'
  final: boolean
}

export interface ToolCallEvent {
  kind: 'tool_call'
  callId: string
  name: string
  arguments: string // JSON string
}

export interface ErrorEvent {
  kind: 'error'
  message: string
}

export type ProviderEvent = AudioEvent | TranscriptEvent | ToolCallEvent | ErrorEvent

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface VoiceProvider {
  connect(instructions: string, tools: ToolDef[], vad?: boolean): Promise<void>
  sendAudio(audioB64: string): Promise<void>
  commitAudio(): Promise<void>
  receive(): AsyncGenerator<ProviderEvent>
  sendToolResult(callId: string, result: string): Promise<void>
  close(): Promise<void>
}
