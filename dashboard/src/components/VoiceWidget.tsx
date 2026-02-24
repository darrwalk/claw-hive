'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'claw-voice': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'ws-url'?: string
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

export default function VoiceWidget() {
  const loaded = useRef(false)
  const [ready, setReady] = useState(false)
  const [voiceUrl, setVoiceUrl] = useState('')

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

  if (!ready || !voiceUrl) return null

  const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${wsProto}//${window.location.hostname}:${getVoicePort()}/ws`

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 h-[480px]">
      <claw-voice ws-url={wsUrl} theme="dark" />
    </div>
  )
}
