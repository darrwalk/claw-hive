'use client'

import { useEffect, useRef } from 'react'

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

const VOICE_URL = process.env.NEXT_PUBLIC_CLAW_VOICE_URL || ''

export default function VoiceWidget() {
  const loaded = useRef(false)

  useEffect(() => {
    if (loaded.current || !VOICE_URL) return
    loaded.current = true

    const script = document.createElement('script')
    script.src = `${VOICE_URL}/dist/claw-voice.js`
    document.head.appendChild(script)
  }, [])

  if (!VOICE_URL) return null

  const wsUrl = VOICE_URL.replace(/^http/, 'ws') + '/ws'

  return (
    <div className="fixed bottom-6 right-6 z-50 w-80 h-[480px]">
      <claw-voice ws-url={wsUrl} theme="dark" />
    </div>
  )
}
