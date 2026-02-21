'use client'

import { useState, useEffect } from 'react'

type Mode = 'datetime' | 'time' | 'date'

const formatters: Record<Mode, (d: Date) => string> = {
  datetime: d => d.toLocaleString(),
  time: d => d.toLocaleTimeString(),
  date: d => d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }),
}

export default function ClientDate({ iso, mode = 'datetime' }: { iso: string | Date, mode?: Mode }) {
  const [text, setText] = useState('')

  useEffect(() => {
    setText(formatters[mode](new Date(iso)))
  }, [iso, mode])

  return <>{text}</>
}
