'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'claw-voice': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'ws-url'?: string
        token?: string
        provider?: string
        theme?: string
        mode?: string
      }
    }
  }
}

const VOICE_PORT_HTTP = 4200
const VOICE_PORT_HTTPS = 8443

function getVoicePort(): number {
  if (typeof window === 'undefined') return VOICE_PORT_HTTP
  return window.location.protocol === 'https:' ? VOICE_PORT_HTTPS : VOICE_PORT_HTTP
}

function getVoiceUrl(): string {
  if (typeof window === 'undefined') return ''
  return `${window.location.protocol}//${window.location.hostname}:${getVoicePort()}`
}

interface Position { x: number; y: number }

export default function VoiceWidget({ wsToken }: { wsToken: string }) {
  const loaded = useRef(false)
  const [ready, setReady] = useState(false)
  const [voiceUrl, setVoiceUrl] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const [pos, setPos] = useState<Position | null>(null)
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const voiceRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (loaded.current) return
    loaded.current = true

    const url = getVoiceUrl()
    if (!url) return
    setVoiceUrl(url)

    const script = document.createElement('script')
    script.src = `${url}/dist/claw-voice.js`
    script.onload = () => setReady(true)
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    const el = voiceRef.current
    if (!el) return
    const handler = (e: Event) => {
      const { collapsed: c } = (e as CustomEvent).detail
      setCollapsed(c)
    }
    el.addEventListener('voice-collapsed', handler)
    return () => el.removeEventListener('voice-collapsed', handler)
  }, [ready])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    dragging.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: rect.left,
      origY: rect.top,
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const { startX, startY, origX, origY } = dragging.current
    const newX = Math.max(0, Math.min(window.innerWidth - 320, origX + e.clientX - startX))
    const newY = Math.max(0, Math.min(window.innerHeight - 60, origY + e.clientY - startY))
    setPos({ x: newX, y: newY })
  }, [])

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  if (!ready || !voiceUrl) return null

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${window.location.hostname}:${getVoicePort()}/ws`

  const posStyle: React.CSSProperties = pos
    ? { top: pos.y, left: pos.x, bottom: 'auto', right: 'auto' }
    : {}

  return (
    <div
      ref={containerRef}
      className={`fixed bottom-6 right-6 z-50 ${collapsed ? '' : 'w-80 h-[480px]'}`}
      style={posStyle}
    >
      {!collapsed && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            height: 14,
            cursor: 'grab',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '12px 12px 0 0',
            background: '#1a1a24',
            borderBottom: 'none',
          }}
        >
          <div style={{
            width: 40,
            height: 4,
            borderRadius: 2,
            background: '#4a4a5a',
          }} />
        </div>
      )}
      <claw-voice
        ref={voiceRef}
        ws-url={wsUrl}
        token={wsToken}
        theme="dark"
        style={{ height: collapsed ? undefined : 'calc(100% - 14px)' }}
      />
    </div>
  )
}
