'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

// ── Constants ────────────────────────────────
const SAMPLE_RATE_OPENAI = 24000
const SAMPLE_RATE_GEMINI_IN = 16000
const SAMPLE_RATE_GEMINI_OUT = 24000

const PROVIDER_COSTS: Record<string, string> = {
  grok: '~$0.05/min',
  openai: '~$0.18/min',
  gemini: 'free preview',
}

// ── Audio helpers (ported verbatim from voice-bridge/static/index.html) ──

function resample(float32: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return float32
  const ratio = fromRate / toRate
  const len = Math.round(float32.length / ratio)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const idx = i * ratio
    const lo = Math.floor(idx)
    const hi = Math.min(lo + 1, float32.length - 1)
    const frac = idx - lo
    out[i] = float32[lo] * (1 - frac) + float32[hi] * frac
  }
  return out
}

function float32ToPcm16B64(float32: Float32Array): string {
  const buf = new ArrayBuffer(float32.length * 2)
  const view = new DataView(buf)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

const WORKLET_CODE = [
  'class PcmCapture extends AudioWorkletProcessor {',
  '  process(inputs) {',
  '    const input = inputs[0];',
  '    if (input.length > 0) this.port.postMessage(input[0]);',
  '    return true;',
  '  }',
  '}',
  "registerProcessor('pcm-capture', PcmCapture);",
].join('\n')

// ── Types ────────────────────────────────────

interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string
}

interface ProviderInfo {
  name: string
  available: boolean
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'recording' | 'speaking' | 'error'

// ── Component ────────────────────────────────

export default function VoiceWidget() {
  const [open, setOpen] = useState(false)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [currentProvider, setCurrentProvider] = useState('grok')
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [statusText, setStatusText] = useState('Disconnected')
  const [isRecording, setIsRecording] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isHandsFree, setIsHandsFree] = useState(false)

  // Imperative refs for audio/ws state (no re-renders on mutation)
  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const playbackQueueRef = useRef<Int16Array[]>([])
  const isPlayingRef = useRef(false)
  const isRecordingRef = useRef(false)
  const isHandsFreeRef = useRef(false)
  const partialAssistantRef = useRef('')
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const transcriptEndRef = useRef<HTMLDivElement>(null)
  const initedRef = useRef(false)
  const currentProviderRef = useRef('grok')

  // Keep refs in sync with state
  useEffect(() => { isRecordingRef.current = isRecording }, [isRecording])
  useEffect(() => { isHandsFreeRef.current = isHandsFree }, [isHandsFree])
  useEffect(() => { currentProviderRef.current = currentProvider }, [currentProvider])

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const addMessage = useCallback((text: string, role: TranscriptEntry['role']) => {
    if (!text.trim()) return
    setTranscript(prev => [...prev, { role, text }])
  }, [])

  const getInputSampleRate = useCallback(() => {
    return currentProviderRef.current === 'gemini' ? SAMPLE_RATE_GEMINI_IN : SAMPLE_RATE_OPENAI
  }, [])

  const getOutputSampleRate = useCallback(() => {
    return currentProviderRef.current === 'gemini' ? SAMPLE_RATE_GEMINI_OUT : SAMPLE_RATE_OPENAI
  }, [])

  const clearProcessingTimeout = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
      processingTimeoutRef.current = null
    }
  }, [])

  // ── Playback ──────────────────────────────

  const playNext = useCallback(() => {
    const queue = playbackQueueRef.current
    const ctx = audioCtxRef.current
    if (queue.length === 0 || !ctx) {
      isPlayingRef.current = false
      setIsSpeaking(false)
      setStatus('connected')
      setStatusText('Connected')
      return
    }
    isPlayingRef.current = true
    setIsSpeaking(true)
    setStatus('speaking')
    setStatusText('Claudia is speaking...')

    const samples = queue.shift()!
    const rate = getOutputSampleRate()
    const audioBuf = ctx.createBuffer(1, samples.length, rate)
    const channel = audioBuf.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768

    const source = ctx.createBufferSource()
    source.buffer = audioBuf
    source.connect(ctx.destination)
    source.onended = playNext
    source.start()
  }, [getOutputSampleRate])

  const queueAudio = useCallback((b64data: string) => {
    clearProcessingTimeout()
    const bytes = atob(b64data)
    const buf = new Int16Array(bytes.length / 2)
    const view = new DataView(new ArrayBuffer(bytes.length))
    for (let i = 0; i < bytes.length; i++) view.setUint8(i, bytes.charCodeAt(i))
    for (let i = 0; i < buf.length; i++) buf[i] = view.getInt16(i * 2, true)
    playbackQueueRef.current.push(buf)
    if (!isPlayingRef.current) playNext()
  }, [playNext, clearProcessingTimeout])

  // ── Transcript handling ───────────────────

  const handleTranscript = useCallback((msg: { role: string; text: string; final: boolean }) => {
    if (msg.role === 'user' && msg.final) {
      addMessage(msg.text, 'user')
      return
    }
    if (msg.role === 'assistant') {
      partialAssistantRef.current += msg.text
      if (msg.final) {
        clearProcessingTimeout()
        if (partialAssistantRef.current.trim()) {
          addMessage(partialAssistantRef.current, 'assistant')
        }
        partialAssistantRef.current = ''
        if (!isPlayingRef.current && playbackQueueRef.current.length === 0) {
          setStatus('connected')
          setStatusText('Connected')
        }
      }
    }
  }, [addMessage, clearProcessingTimeout])

  // ── Recording controls ────────────────────

  const startRecording = useCallback(() => {
    if (isRecordingRef.current) return
    setIsRecording(true)
    isRecordingRef.current = true
    playbackQueueRef.current = []
    setIsSpeaking(false)
    isPlayingRef.current = false
    setStatus('recording')
    setStatusText('Listening...')
  }, [])

  const stopRecording = useCallback(() => {
    if (!isRecordingRef.current) return
    setIsRecording(false)
    isRecordingRef.current = false
    isPlayingRef.current = false
    setStatus('connected')
    setStatusText('Processing...')
    if (!isHandsFreeRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'commit' }))
    }
    clearProcessingTimeout()
    processingTimeoutRef.current = setTimeout(() => {
      setStatus(prev => {
        if (prev === 'connected' || prev === 'recording' || prev === 'disconnected') return prev
        return 'connected'
      })
      setStatusText(prev => {
        if (['Connected', 'Listening...', 'Disconnected'].includes(prev)) return prev
        return 'Connected'
      })
    }, 15_000)
  }, [clearProcessingTimeout])

  // ── WebSocket ─────────────────────────────

  const connectWs = useCallback((provider: string) => {
    if (wsRef.current) wsRef.current.close()

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const vad = isHandsFreeRef.current
    const url = `${proto}//${window.location.host}/api/voice?provider=${provider}&vad=${vad}`

    setStatus('connecting')
    setStatusText('Connecting...')

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatusText('Authenticating...')
    }

    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'connected':
          setStatus('connected')
          setStatusText(`Connected — ${msg.provider}`)
          if (isHandsFreeRef.current) startRecording()
          break
        case 'audio':
          queueAudio(msg.data)
          break
        case 'transcript':
          handleTranscript(msg)
          break
        case 'tool_call':
          addMessage(`Searching: ${msg.name}...`, 'tool')
          break
        case 'tool_result':
          addMessage(`Found: ${msg.result}`, 'tool')
          break
        case 'error':
          addMessage(`Error: ${msg.message}`, 'system')
          setStatus('error')
          setStatusText('Error')
          break
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      setStatusText('Disconnected')
    }

    ws.onerror = () => {
      setStatus('error')
      setStatusText('Connection error')
    }
  }, [queueAudio, handleTranscript, addMessage, startRecording])

  // ── Audio init ────────────────────────────

  const initAudio = useCallback(async () => {
    if (initedRef.current) return
    initedRef.current = true

    const audioCtx = new AudioContext()
    audioCtxRef.current = audioCtx

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true },
    })
    micStreamRef.current = micStream

    const source = audioCtx.createMediaStreamSource(micStream)
    const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    await audioCtx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    const workletNode = new AudioWorkletNode(audioCtx, 'pcm-capture')
    workletNodeRef.current = workletNode

    workletNode.port.onmessage = (e: MessageEvent<Float32Array>) => {
      const ws = wsRef.current
      if (!isRecordingRef.current || !ws || ws.readyState !== WebSocket.OPEN) return
      const resampled = resample(e.data, audioCtx.sampleRate, getInputSampleRate())
      const b64 = float32ToPcm16B64(resampled)
      ws.send(JSON.stringify({ type: 'audio', data: b64 }))
    }

    source.connect(workletNode)
  }, [getInputSampleRate])

  // ── Load providers ────────────────────────

  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/voice-config')
      const data = await res.json()
      const available = (data.providers as ProviderInfo[]).filter(p => p.available)
      setProviders(available)
      if (available.length > 0) {
        setCurrentProvider(available[0].name)
        currentProviderRef.current = available[0].name
      }
      return available.length > 0 ? available[0].name : 'grok'
    } catch {
      console.warn('Could not load voice provider config')
      return 'grok'
    }
  }, [])

  // ── Panel open/close ──────────────────────

  const handleOpen = useCallback(async () => {
    setOpen(true)
    try {
      const provider = await loadProviders()
      await initAudio()
      connectWs(provider)
      addMessage('Tap the mic button or hold Space to talk to Claudia.', 'system')
    } catch (e) {
      addMessage(`Init error: ${e instanceof Error ? e.message : String(e)}`, 'system')
    }
  }, [loadProviders, initAudio, connectWs, addMessage])

  const handleClose = useCallback(() => {
    setOpen(false)
    clearProcessingTimeout()
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setIsRecording(false)
    isRecordingRef.current = false
    setStatus('disconnected')
    setStatusText('Disconnected')
  }, [clearProcessingTimeout])

  // ── Keyboard (Space) ─────────────────────

  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && !e.repeat && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        if (isHandsFreeRef.current) {
          isRecordingRef.current ? stopRecording() : startRecording()
        } else {
          startRecording()
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        if (!isHandsFreeRef.current) stopRecording()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [open, startRecording, stopRecording])

  // ── Provider change ───────────────────────

  const handleProviderChange = useCallback((name: string) => {
    setCurrentProvider(name)
    currentProviderRef.current = name
    partialAssistantRef.current = ''
    connectWs(name)
  }, [connectWs])

  // ── Status dot color ──────────────────────

  const dotColor = {
    disconnected: 'bg-muted-foreground',
    connecting: 'bg-muted-foreground',
    connected: 'bg-green-500',
    recording: 'bg-red-500 animate-pulse',
    speaking: 'bg-violet-500 animate-pulse',
    error: 'bg-red-500',
  }[status]

  // ── Render ────────────────────────────────

  return (
    <>
      {/* Floating mic button — tabIndex -1 so Space goes to PTT, not toggle */}
      <button
        tabIndex={-1}
        onClick={open ? handleClose : handleOpen}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg',
          'flex items-center justify-center transition-all duration-200',
          'bg-violet-600 hover:bg-violet-500 text-white',
          open && 'bg-muted hover:bg-muted/80 text-muted-foreground',
        )}
        aria-label={open ? 'Close voice panel' : 'Open voice panel'}
      >
        {open ? <X className="h-5 w-5" /> : <Mic className="h-6 w-6" />}
      </button>

      {/* Voice panel */}
      <div
        className={cn(
          'fixed bottom-24 right-6 z-50 w-80 rounded-xl border bg-card shadow-2xl',
          'flex flex-col overflow-hidden transition-all duration-300',
          open ? 'h-[480px] opacity-100 translate-y-0' : 'h-0 opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-semibold">Claudia Voice</span>
            <div className="flex items-center gap-1.5">
              <span className={cn('h-2 w-2 rounded-full', dotColor)} />
              <span className="text-xs text-muted-foreground">{statusText}</span>
            </div>
          </div>
          {providers.length > 0 && (
            <Select value={currentProvider} onValueChange={handleProviderChange}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map(p => (
                  <SelectItem key={p.name} value={p.name} className="text-xs">
                    {p.name} ({PROVIDER_COSTS[p.name] || ''})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Transcript */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {transcript.map((entry, i) => (
            <div
              key={i}
              className={cn(
                'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
                entry.role === 'user' && 'ml-auto bg-violet-600 text-white rounded-br-sm',
                entry.role === 'assistant' && 'bg-muted rounded-bl-sm',
                entry.role === 'system' && 'mx-auto text-xs text-muted-foreground italic',
                entry.role === 'tool' && 'mx-auto text-xs text-violet-400 bg-muted px-3 py-1 rounded-full',
              )}
            >
              {entry.text}
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-2 border-t px-4 py-4">
          <button
            tabIndex={-1}
            onPointerDown={(e) => {
              e.preventDefault()
              if (isHandsFree) {
                isRecording ? stopRecording() : startRecording()
              } else {
                startRecording()
              }
            }}
            onPointerUp={(e) => {
              e.preventDefault()
              if (!isHandsFree) stopRecording()
            }}
            onPointerLeave={(e) => {
              e.preventDefault()
              if (!isHandsFree && isRecording) stopRecording()
            }}
            className={cn(
              'h-16 w-16 rounded-full border-2 flex items-center justify-center transition-all duration-200',
              'touch-none select-none',
              isRecording
                ? 'bg-red-500 border-red-500 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                : isSpeaking
                  ? 'bg-card border-violet-500 shadow-[0_0_30px_rgba(139,92,246,0.3)]'
                  : 'bg-card border-border hover:border-violet-500',
            )}
          >
            {isRecording ? (
              <MicOff className="h-6 w-6 text-white" />
            ) : (
              <Mic className={cn('h-6 w-6', isSpeaking ? 'text-violet-500' : 'text-foreground')} />
            )}
          </button>

          <button
            onClick={() => {
              setIsHandsFree(v => {
                const next = !v
                isHandsFreeRef.current = next
                if (isRecording) stopRecording()
                connectWs(currentProviderRef.current)
                return next
              })
            }}
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
              isHandsFree ? 'bg-violet-600' : 'bg-muted-foreground/30',
            )}>
              <span className={cn(
                'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform mt-0.5',
                isHandsFree ? 'translate-x-[18px]' : 'translate-x-0.5',
              )} />
            </span>
            {isHandsFree ? 'Hands-free' : 'Push-to-talk'}
          </button>

          <span className="text-[11px] text-muted-foreground">
            {isHandsFree
              ? 'Open mic — VAD detects speech boundaries'
              : 'Hold button or press Space to talk'}
          </span>
        </div>
      </div>
    </>
  )
}
