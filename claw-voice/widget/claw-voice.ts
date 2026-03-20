// <claw-voice> Web Component — standalone voice UI
// Attributes: ws-url, provider, theme (dark|light), mode (push-to-talk|hands-free)
// Events: voice-connected, voice-transcript, voice-error, voice-disconnected

const SAMPLE_RATE_OPENAI = 24000
const SAMPLE_RATE_GEMINI_IN = 16000
const SAMPLE_RATE_GEMINI_OUT = 24000

const PROVIDER_COSTS: Record<string, string> = {
  grok: '~$0.05/min',
  openai: '~$0.18/min',
  gemini: 'free preview',
}

function resample(float32: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return float32
  const ratio = fromRate / toRate
  const len = Math.round(float32.length / ratio)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) {
    const idx = i * ratio
    const i0 = Math.floor(idx)
    const frac = idx - i0
    // Cubic Hermite interpolation (4-point)
    const im1 = Math.max(i0 - 1, 0)
    const i1 = Math.min(i0 + 1, float32.length - 1)
    const i2 = Math.min(i0 + 2, float32.length - 1)
    const a = float32[im1], b = float32[i0], c = float32[i1], d = float32[i2]
    const t = frac
    out[i] = b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)))
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

const WORKLET_CODE = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.envelope = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input.length === 0) return true;
    const raw = input[0];
    const out = new Float32Array(raw.length);
    let sumSq = 0;

    // Soft limiter: exponential envelope follower
    const attack = 0.002;
    const release = 0.01;
    const threshold = 0.8;
    let env = this.envelope;

    for (let i = 0; i < raw.length; i++) {
      const abs = Math.abs(raw[i]);
      env = abs > env ? env + attack * (abs - env) : env + release * (env > 0 ? -env : 0);
      const gain = env > threshold ? threshold / env : 1.0;
      out[i] = raw[i] * gain;
      sumSq += out[i] * out[i];
    }
    this.envelope = env;

    const rms = Math.sqrt(sumSq / raw.length);
    this.port.postMessage({ audio: out, rms });
    return true;
  }
}
registerProcessor('pcm-capture', PcmCapture);
`

interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system' | 'tool'
  text: string
}

interface ProviderInfo {
  name: string
  available: boolean
  voices?: string[]
}

interface VoicePrefs {
  provider: string
  voices: Record<string, string>
  mode: 'push-to-talk' | 'hands-free'
}

const PREFS_KEY = 'claw-voice-prefs'

const STYLES = `
:host {
  display: block;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --bg: #0f0f14;
  --surface: #1a1a24;
  --border: #2a2a3a;
  --text: #e0e0e8;
  --text-dim: #8888a0;
  --accent: #7c6fe0;
  --accent-glow: rgba(124, 111, 224, 0.3);
  --red: #e05555;
  --green: #55c080;
}
:host([theme="light"]) {
  --bg: #f5f5f7;
  --surface: #ffffff;
  --border: #e0e0e4;
  --text: #1a1a2e;
  --text-dim: #6b6b80;
  --accent: #6d5dd3;
  --accent-glow: rgba(109, 93, 211, 0.2);
  --red: #d04040;
  --green: #3daa6d;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
.container {
  background: var(--bg);
  color: var(--text);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid var(--border);
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
header h1 { font-size: 18px; font-weight: 600; }
.provider-select {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 12px;
  font-size: 14px;
  cursor: pointer;
}
.status {
  font-size: 12px;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: 6px;
}
.status-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--text-dim);
  flex-shrink: 0;
}
.status-dot.connected { background: var(--green); }
.status-dot.recording { background: var(--red); animation: pulse 1s infinite; }
.status-dot.speaking { background: var(--accent); animation: pulse 0.8s infinite; }
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.3); }
}
.transcript {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.msg {
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 14px;
  font-size: 15px;
  line-height: 1.4;
  word-wrap: break-word;
}
.msg.user {
  align-self: flex-end;
  background: var(--accent);
  color: white;
  border-bottom-right-radius: 4px;
}
.msg.assistant {
  align-self: flex-start;
  background: var(--surface);
  border-bottom-left-radius: 4px;
}
.msg.system {
  align-self: center;
  color: var(--text-dim);
  font-size: 13px;
  font-style: italic;
}
.msg.tool {
  align-self: center;
  color: var(--accent);
  font-size: 12px;
  background: var(--surface);
  padding: 6px 12px;
  border-radius: 20px;
}
.controls {
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
.talk-btn {
  width: 80px; height: 80px;
  border-radius: 50%;
  border: 3px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 24px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}
.talk-btn:hover { border-color: var(--accent); }
.talk-btn { --mic-level: 0; }
.talk-btn.active {
  background: var(--red);
  border-color: var(--red);
  transform: scale(calc(1.05 + var(--mic-level) * 0.1));
  box-shadow: 0 0 calc(15px + var(--mic-level) * 30px) rgba(224, 85, 85, calc(0.3 + var(--mic-level) * 0.4));
}
.talk-btn.speaking {
  border-color: var(--accent);
  box-shadow: 0 0 30px var(--accent-glow);
}
.mode-toggle {
  font-size: 13px;
  color: var(--text);
  cursor: pointer;
  user-select: none;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 6px 16px;
  transition: all 0.2s;
}
.mode-toggle:hover {
  border-color: var(--accent);
}
.mode-toggle.active {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}
.hint {
  font-size: 12px;
  color: var(--text-dim);
}
.minimize-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 20px;
  padding: 4px 8px;
  line-height: 1;
}
.minimize-btn:hover { color: var(--text); }
.settings-btn {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}
.settings-btn:hover { color: var(--text); }
.settings-row {
  display: none;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.settings-row.open { display: flex; }
.settings-row label { font-size: 13px; color: var(--text-dim); white-space: nowrap; }
.settings-row select {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 13px;
  flex: 1;
  cursor: pointer;
}
.fab {
  display: none;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  border: none;
  cursor: pointer;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s, box-shadow 0.2s;
}
.fab:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 24px var(--accent-glow);
}
.fab:active { transform: scale(0.95); }
:host(.collapsed) .container { display: none; }
:host(.collapsed) .fab { display: flex; }
:host(.collapsed) { width: 56px !important; height: 56px !important; }
`

function createMicIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '28')
  svg.setAttribute('height', '28')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')

  const path1 = document.createElementNS(ns, 'path')
  path1.setAttribute('d', 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z')
  const path2 = document.createElementNS(ns, 'path')
  path2.setAttribute('d', 'M19 10v2a7 7 0 0 1-14 0v-2')
  const line = document.createElementNS(ns, 'line')
  line.setAttribute('x1', '12'); line.setAttribute('x2', '12')
  line.setAttribute('y1', '19'); line.setAttribute('y2', '22')

  svg.append(path1, path2, line)
  return svg
}

function createMicOffIcon(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '28')
  svg.setAttribute('height', '28')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')

  const paths = [
    'M2 2 22 22', 'M18.89 13.23A7.12 7.12 0 0 0 19 12v-2',
    'M5 10v2a7 7 0 0 0 12 5', 'M15 9.34V5a3 3 0 0 0-5.68-1.33',
    'M9 9v3a3 3 0 0 0 5.12 2.12',
  ]
  for (const d of paths) {
    const p = document.createElementNS(ns, 'path')
    p.setAttribute('d', d)
    svg.appendChild(p)
  }
  const line = document.createElementNS(ns, 'line')
  line.setAttribute('x1', '12'); line.setAttribute('x2', '12')
  line.setAttribute('y1', '19'); line.setAttribute('y2', '22')
  svg.appendChild(line)
  return svg
}

function buildDOM(shadow: ShadowRoot): Record<string, HTMLElement> {
  const style = document.createElement('style')
  style.textContent = STYLES

  const container = document.createElement('div')
  container.className = 'container'

  // Header
  const header = document.createElement('header')
  const headerLeft = document.createElement('div')
  const h1 = document.createElement('h1')
  h1.textContent = 'Claudia Voice'
  const statusDiv = document.createElement('div')
  statusDiv.className = 'status'
  const statusDot = document.createElement('span')
  statusDot.className = 'status-dot'
  statusDot.id = 'statusDot'
  const statusText = document.createElement('span')
  statusText.id = 'statusText'
  statusText.textContent = 'Disconnected'
  statusDiv.append(statusDot, statusText)
  headerLeft.append(h1, statusDiv)
  const providerSelect = document.createElement('select')
  providerSelect.className = 'provider-select'
  providerSelect.id = 'providerSelect'
  const settingsBtn = document.createElement('button')
  settingsBtn.className = 'settings-btn'
  settingsBtn.id = 'settingsBtn'
  settingsBtn.textContent = '⚙'
  settingsBtn.title = 'Voice settings'
  const minimizeBtn = document.createElement('button')
  minimizeBtn.className = 'minimize-btn'
  minimizeBtn.id = 'minimizeBtn'
  minimizeBtn.textContent = '−'
  minimizeBtn.title = 'Minimize to mic button'
  header.append(headerLeft, providerSelect, settingsBtn, minimizeBtn)

  // Settings row
  const settingsRow = document.createElement('div')
  settingsRow.className = 'settings-row'
  settingsRow.id = 'settingsRow'
  const voiceLabel = document.createElement('label')
  voiceLabel.textContent = 'Voice'
  const voiceSelect = document.createElement('select')
  voiceSelect.className = 'voice-select'
  voiceSelect.id = 'voiceSelect'
  settingsRow.append(voiceLabel, voiceSelect)

  // Transcript
  const transcript = document.createElement('div')
  transcript.className = 'transcript'
  transcript.id = 'transcript'

  // Controls
  const controls = document.createElement('div')
  controls.className = 'controls'
  const talkBtn = document.createElement('button')
  talkBtn.className = 'talk-btn'
  talkBtn.id = 'talkBtn'
  talkBtn.appendChild(createMicIcon())
  const modeToggle = document.createElement('button')
  modeToggle.className = 'mode-toggle'
  modeToggle.id = 'modeToggle'
  modeToggle.textContent = 'Mode: Push-to-talk'
  const hint = document.createElement('div')
  hint.className = 'hint'
  hint.id = 'hint'
  hint.textContent = 'Hold button or press Space to talk'
  controls.append(talkBtn, modeToggle, hint)

  container.append(header, settingsRow, transcript, controls)

  const fab = document.createElement('button')
  fab.className = 'fab'
  fab.id = 'fab'
  fab.title = 'Open voice widget'
  fab.appendChild(createMicIcon())

  shadow.append(style, container, fab)

  return {
    transcript, talkBtn, statusDot, statusText, providerSelect, modeToggle, hint,
    minimizeBtn, fab, settingsBtn, settingsRow, voiceSelect,
  }
}

export class ClawVoice extends HTMLElement {
  private shadow: ShadowRoot
  private ws: WebSocket | null = null
  private audioCtx: AudioContext | null = null
  private micStream: MediaStream | null = null
  private workletNode: AudioWorkletNode | null = null
  private scriptNode: ScriptProcessorNode | null = null
  private playbackQueue: Int16Array[] = []
  private queuedSamples = 0
  private isPlaying = false
  private isRecording = false
  private isHandsFree = true
  private isSpeaking = false
  private nextPlayTime = 0
  private playbackGain: GainNode | null = null
  private activeSource: AudioBufferSourceNode | null = null
  private playbackGen = 0
  private playSeq = 0
  private partialAssistant = ''
  private currentProvider = 'gemini'
  private currentVoice = ''
  private providers: ProviderInfo[] = []
  private providerVoices: Record<string, string[]> = {}
  private transcript: TranscriptEntry[] = []
  private audioInited = false
  private pendingSample = false
  private processingTimeout: ReturnType<typeof setTimeout> | null = null
  private intentionalClose = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null
  private wakeLock: WakeLockSentinel | null = null

  // DOM refs
  private transcriptEl!: HTMLElement
  private talkBtn!: HTMLElement
  private statusDot!: HTMLElement
  private statusTextEl!: HTMLElement
  private providerSelect!: HTMLSelectElement
  private modeToggle!: HTMLElement
  private hintEl!: HTMLElement
  private minimizeBtn!: HTMLElement
  private fab!: HTMLElement
  private settingsBtn!: HTMLElement
  private settingsRow!: HTMLElement
  private voiceSelect!: HTMLSelectElement

  static get observedAttributes(): string[] {
    return ['ws-url', 'provider', 'theme', 'mode']
  }

  constructor() {
    super()
    this.shadow = this.attachShadow({ mode: 'open' })
  }

  connectedCallback(): void {
    const els = buildDOM(this.shadow)
    this.transcriptEl = els.transcript
    this.talkBtn = els.talkBtn
    this.statusDot = els.statusDot
    this.statusTextEl = els.statusText
    this.providerSelect = els.providerSelect as HTMLSelectElement
    this.modeToggle = els.modeToggle
    this.hintEl = els.hint
    this.minimizeBtn = els.minimizeBtn
    this.fab = els.fab
    this.settingsBtn = els.settingsBtn
    this.settingsRow = els.settingsRow
    this.voiceSelect = els.voiceSelect as HTMLSelectElement
    this.bindEvents()
    this.init()
  }

  disconnectedCallback(): void {
    this.cleanup()
  }

  attributeChangedCallback(name: string, _old: string | null, val: string | null): void {
    if (name === 'provider' && val) {
      this.currentProvider = val
      if (this.providerSelect) this.providerSelect.value = val
    }
    if (name === 'mode' && val) {
      this.isHandsFree = val === 'hands-free'
      this.updateModeUI()
    }
  }

  private get wsUrl(): string {
    const attr = this.getAttribute('ws-url')
    if (attr) return attr
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${location.host}/ws`
  }

  private bindEvents(): void {
    this.minimizeBtn.addEventListener('click', () => {
      this.classList.add('collapsed')
      this.emit('voice-collapsed', { collapsed: true })
    })
    this.fab.addEventListener('click', () => {
      this.classList.remove('collapsed')
      this.emit('voice-collapsed', { collapsed: false })
    })

    this.settingsBtn.addEventListener('click', () => {
      this.settingsRow.classList.toggle('open')
    })

    this.voiceSelect.addEventListener('change', () => {
      this.currentVoice = this.voiceSelect.value
      this.savePrefs()
      this.pendingSample = true
      this.connectWs()
    })

    this.talkBtn.addEventListener('pointerdown', async (e) => {
      e.preventDefault()
      navigator.vibrate?.(10)
      if (this.isHandsFree) {
        this.isRecording ? this.stopRecording() : await this.startRecording()
      } else {
        await this.startRecording()
      }
    })
    this.talkBtn.addEventListener('pointerup', (e) => {
      e.preventDefault()
      navigator.vibrate?.(5)
      if (!this.isHandsFree) this.stopRecording()
    })
    this.talkBtn.addEventListener('pointerleave', (e) => {
      e.preventDefault()
      if (!this.isHandsFree && this.isRecording) this.stopRecording()
    })

    this.modeToggle.addEventListener('click', async () => {
      console.log('[claw-voice] mode toggle clicked, isHandsFree was:', this.isHandsFree)
      this.isHandsFree = !this.isHandsFree
      this.updateModeUI()
      this.savePrefs()
      if (this.isRecording) this.stopRecording()
      if (!this.audioInited) {
        console.log('[claw-voice] initAudio from mode toggle (user gesture)')
        try { await this.initAudio() } catch (err) { console.error('[claw-voice] initAudio failed:', err) }
      }
      console.log('[claw-voice] audioInited:', this.audioInited, 'calling connectWs')
      this.connectWs()
    })

    this.providerSelect.addEventListener('change', async () => {
      this.currentProvider = this.providerSelect.value
      this.partialAssistant = ''
      this.populateVoiceSelect()
      this.savePrefs()
      if (this.currentProvider === 'gemini' && !this.isHandsFree) {
        this.isHandsFree = true
        this.updateModeUI()
        this.savePrefs()
      }
      if (this.isHandsFree && !this.audioInited) {
        try { await this.initAudio() } catch { /* startRecording will retry */ }
      }
      this.connectWs()
    })

    const onKeyDown = async (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && !e.repeat && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        if (this.isHandsFree) {
          this.isRecording ? this.stopRecording() : await this.startRecording()
        } else {
          await this.startRecording()
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
        e.preventDefault()
        if (!this.isHandsFree) this.stopRecording()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('keyup', onKeyUp)

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.ws?.readyState === WebSocket.OPEN) {
        this.acquireWakeLock()
      }
    })
  }

  private updateModeUI(): void {
    if (!this.modeToggle) return
    this.modeToggle.textContent = `Mode: ${this.isHandsFree ? 'Hands-free (VAD)' : 'Push-to-talk'}`
    this.modeToggle.classList.toggle('active', this.isHandsFree)
    this.hintEl.textContent = this.isHandsFree
      ? 'Tap button to start/stop — VAD detects speech'
      : 'Hold button or press Space to talk'
  }

  private async init(): Promise<void> {
    this.loadPrefs()
    const initialProvider = this.getAttribute('provider')
    if (initialProvider) this.currentProvider = initialProvider
    const initialMode = this.getAttribute('mode')
    if (initialMode === 'hands-free') this.isHandsFree = true
    this.updateModeUI()

    await this.loadProviders()
    this.populateVoiceSelect()
    this.connectWs()
    this.addMessage('Tap the mic button or hold Space to talk.', 'system')
  }

  private async loadProviders(): Promise<void> {
    try {
      const baseUrl = this.getAttribute('ws-url')
      let configUrl: string
      if (baseUrl) {
        const u = new URL(baseUrl)
        u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'
        u.pathname = '/config'
        configUrl = u.toString()
      } else {
        configUrl = '/config'
      }
      const res = await fetch(configUrl)
      const data = await res.json()
      this.providers = (data.providers as ProviderInfo[]).filter(p => p.available)
      for (const p of this.providers) {
        if (p.voices) this.providerVoices[p.name] = p.voices
      }

      while (this.providerSelect.firstChild) this.providerSelect.removeChild(this.providerSelect.firstChild)
      for (const p of this.providers) {
        const opt = document.createElement('option')
        opt.value = p.name
        opt.textContent = `${p.name} (${PROVIDER_COSTS[p.name] || ''})`
        this.providerSelect.appendChild(opt)
      }
      if (this.providers.length > 0 && !this.providers.find(p => p.name === this.currentProvider)) {
        this.currentProvider = this.providers[0].name
      }
      this.providerSelect.value = this.currentProvider
    } catch {
      for (const name of ['gemini', 'openai', 'grok']) {
        const opt = document.createElement('option')
        opt.value = name
        opt.textContent = `${name} (${PROVIDER_COSTS[name] || ''})`
        this.providerSelect.appendChild(opt)
      }
    }
  }

  private handleAudioChunk(audio: Float32Array, rms: number): void {
    if (this.isRecording) {
      const level = Math.min(rms * 5, 1)
      this.talkBtn.style.setProperty('--mic-level', String(level))
    }
    if (!this.isRecording || !this.ws || this.ws.readyState !== WebSocket.OPEN) return
    const targetRate = this.currentProvider === 'gemini' ? SAMPLE_RATE_GEMINI_IN : SAMPLE_RATE_OPENAI
    const resampled = resample(audio, this.audioCtx!.sampleRate, targetRate)
    const b64 = float32ToPcm16B64(resampled)
    this.ws.send(JSON.stringify({ type: 'audio', data: b64 }))
  }

  private async initAudio(): Promise<void> {
    if (this.audioInited) return

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone requires HTTPS. Use https://claudia.taile65f04.ts.net:8443/')
    }

    this.audioCtx = new AudioContext()
    // iOS Safari suspends AudioContext — resume on user gesture
    if (this.audioCtx.state === 'suspended') await this.audioCtx.resume()

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, autoGainControl: false },
    })

    const source = this.audioCtx.createMediaStreamSource(this.micStream)

    // Try AudioWorklet first, fall back to ScriptProcessorNode (iOS Safari)
    let workletOk = false
    if (this.audioCtx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
        const url = URL.createObjectURL(blob)
        await this.audioCtx.audioWorklet.addModule(url)
        URL.revokeObjectURL(url)

        this.workletNode = new AudioWorkletNode(this.audioCtx, 'pcm-capture')
        this.workletNode.port.onmessage = (e: MessageEvent<{ audio: Float32Array; rms: number }>) => {
          this.handleAudioChunk(e.data.audio, e.data.rms)
        }
        source.connect(this.workletNode)
        workletOk = true
      } catch {
        console.warn('[claw-voice] AudioWorklet failed, falling back to ScriptProcessorNode')
      }
    }

    if (!workletOk) {
      // ScriptProcessorNode fallback — runs on main thread
      const bufSize = 4096
      this.scriptNode = this.audioCtx.createScriptProcessor(bufSize, 1, 1)
      let envelope = 0
      this.scriptNode.onaudioprocess = (e) => {
        const raw = e.inputBuffer.getChannelData(0)
        const out = new Float32Array(raw.length)
        let sumSq = 0
        const attack = 0.002, release = 0.01, threshold = 0.8
        for (let i = 0; i < raw.length; i++) {
          const abs = Math.abs(raw[i])
          envelope = abs > envelope ? envelope + attack * (abs - envelope) : envelope + release * (envelope > 0 ? -envelope : 0)
          const gain = envelope > threshold ? threshold / envelope : 1.0
          out[i] = raw[i] * gain
          sumSq += out[i] * out[i]
        }
        const rms = Math.sqrt(sumSq / raw.length)
        this.handleAudioChunk(out, rms)
      }
      source.connect(this.scriptNode)
      // ScriptProcessorNode needs destination connection to fire events — use silent gain
      const silentGain = this.audioCtx.createGain()
      silentGain.gain.value = 0
      silentGain.connect(this.audioCtx.destination)
      this.scriptNode.connect(silentGain)
    }

    this.audioInited = true
  }

  private connectWs(): void {
    this.intentionalClose = true
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.ws) this.ws.close()
    this.intentionalClose = false
    this.reconnectAttempts = 0
    this.setStatus('', 'Connecting...')
    this.openWs()
  }

  private tryReconnect(): void {
    const MAX_ATTEMPTS = 5
    if (this.reconnectAttempts >= MAX_ATTEMPTS) {
      this.setStatus('', 'Disconnected')
      this.emit('voice-disconnected', {})
      this.addMessage('Connection lost. Tap mic to reconnect.', 'system')
      return
    }
    this.reconnectAttempts++
    const delay = Math.min(1000 * 2 ** (this.reconnectAttempts - 1), 16000) + Math.random() * 1000
    this.setStatus('', `Reconnecting (${this.reconnectAttempts}/${MAX_ATTEMPTS})...`)
    this.reconnectTimer = setTimeout(() => {
      this.openWs()
    }, delay)
  }

  private openWs(): void {
    const voiceParam = this.currentVoice ? `&voice=${encodeURIComponent(this.currentVoice)}` : ''
    const sampleParam = this.pendingSample ? '&sample=true' : ''
    this.pendingSample = false
    const tokenParam = this.getAttribute('token') ? `&token=${encodeURIComponent(this.getAttribute('token')!)}` : ''
    const url = `${this.wsUrl}?provider=${this.currentProvider}&vad=${this.isHandsFree}${voiceParam}${sampleParam}${tokenParam}`

    this.ws = new WebSocket(url)
    this.ws.onopen = () => {
      this.setStatus('', 'Authenticating...')
      this.startHeartbeat()
    }
    this.ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data)
      switch (msg.type) {
        case 'connected':
          this.reconnectAttempts = 0
          this.setStatus('connected', `Connected — ${msg.provider}`)
          this.emit('voice-connected', { provider: msg.provider })
          this.acquireWakeLock()
          if (this.isHandsFree) await this.startRecording()
          break
        case 'audio':
          this.queueAudio(msg.data)
          break
        case 'transcript':
          this.handleTranscript(msg)
          break
        case 'tool_call':
          this.addMessage(`Searching: ${msg.name}...`, 'tool')
          break
        case 'tool_result':
          this.addMessage(`Found: ${msg.result}`, 'tool')
          break
        case 'error':
          this.addMessage(`Error: ${msg.message}`, 'system')
          this.setStatus('', 'Error')
          this.emit('voice-error', { message: msg.message })
          break
      }
    }
    this.ws.onclose = () => {
      this.stopHeartbeat()
      if (this.intentionalClose) {
        this.setStatus('', 'Disconnected')
        this.emit('voice-disconnected', {})
        return
      }
      this.tryReconnect()
    }
    this.ws.onerror = () => {
      if (!this.intentionalClose) this.setStatus('', 'Connection error')
    }
  }

  private queueAudio(b64data: string): void {
    this.clearProcessingTimeout()
    const bytes = atob(b64data)
    const buf = new Int16Array(bytes.length / 2)
    const view = new DataView(new ArrayBuffer(bytes.length))
    for (let i = 0; i < bytes.length; i++) view.setUint8(i, bytes.charCodeAt(i))
    for (let i = 0; i < buf.length; i++) buf[i] = view.getInt16(i * 2, true)

    // Cap queue at ~15s of audio (at playback sample rate)
    const rate = this.currentProvider === 'gemini' ? SAMPLE_RATE_GEMINI_OUT : SAMPLE_RATE_OPENAI
    const maxSamples = rate * 15
    this.playbackQueue.push(buf)
    this.queuedSamples += buf.length
    while (this.queuedSamples > maxSamples && this.playbackQueue.length > 1) {
      const dropped = this.playbackQueue.shift()!
      this.queuedSamples -= dropped.length
    }

    if (!this.isPlaying) this.playNext()
  }

  private ensurePlaybackGain(): GainNode {
    if (!this.playbackGain && this.audioCtx) {
      this.playbackGain = this.audioCtx.createGain()
      this.playbackGain.connect(this.audioCtx.destination)
    }
    return this.playbackGain!
  }

  private playNext(): void {
    if (this.playbackQueue.length === 0 || !this.audioCtx) {
      this.isPlaying = false
      this.isSpeaking = false
      this.activeSource = null
      this.nextPlayTime = 0
      this.talkBtn.classList.remove('speaking')
      this.setStatus('connected', 'Connected')
      return
    }
    this.isPlaying = true
    this.isSpeaking = true
    this.talkBtn.classList.add('speaking')
    this.setStatus('speaking', 'Speaking...')

    const samples = this.playbackQueue.shift()!
    this.queuedSamples -= samples.length
    const rate = this.currentProvider === 'gemini' ? SAMPLE_RATE_GEMINI_OUT : SAMPLE_RATE_OPENAI
    const audioBuf = this.audioCtx.createBuffer(1, samples.length, rate)
    const channel = audioBuf.getChannelData(0)
    for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 32768

    const gain = this.ensurePlaybackGain()
    const source = this.audioCtx.createBufferSource()
    source.buffer = audioBuf
    source.connect(gain)

    // Gapless scheduling: start at end of previous buffer, not "now"
    const now = this.audioCtx.currentTime
    const startAt = this.nextPlayTime > now ? this.nextPlayTime : now
    this.nextPlayTime = startAt + audioBuf.duration

    const gen = this.playbackGen
    source.onended = () => {
      if (this.playbackGen !== gen) return   // barged in
      this.playNext()
    }
    source.start(startAt)
    this.activeSource = source
  }

  private bargeIn(): void {
    this.playbackGen++
    if (!this.audioCtx || !this.isPlaying) return
    // Smooth fade-out instead of hard cut
    if (this.playbackGain) {
      this.playbackGain.gain.setValueAtTime(this.playbackGain.gain.value, this.audioCtx.currentTime)
      this.playbackGain.gain.linearRampToValueAtTime(0, this.audioCtx.currentTime + 0.05)
      setTimeout(() => {
        if (this.playbackGain) this.playbackGain.gain.value = 1
      }, 60)
    }
    this.activeSource?.stop()
    this.activeSource = null
    this.playbackQueue = []
    this.queuedSamples = 0
    this.nextPlayTime = 0
    this.isPlaying = false
    this.isSpeaking = false
    this.talkBtn.classList.remove('speaking')
  }

  private duckPlayback(duck: boolean): void {
    if (!this.audioCtx || !this.playbackGain) return
    const t = this.audioCtx.currentTime
    this.playbackGain.gain.setValueAtTime(this.playbackGain.gain.value, t)
    this.playbackGain.gain.linearRampToValueAtTime(duck ? 0.1 : 1.0, t + 0.05)
  }

  private handleTranscript(msg: { role: string; text: string; final: boolean }): void {
    if (msg.role === 'user' && msg.final) {
      this.addMessage(msg.text, 'user')
      this.emit('voice-transcript', { role: 'user', text: msg.text })
      return
    }
    if (msg.role === 'assistant') {
      this.partialAssistant += msg.text
      if (msg.final) {
        this.clearProcessingTimeout()
        if (this.partialAssistant.trim()) {
          this.addMessage(this.partialAssistant, 'assistant')
          this.emit('voice-transcript', { role: 'assistant', text: this.partialAssistant })
        }
        this.partialAssistant = ''
        if (!this.isPlaying && this.playbackQueue.length === 0) {
          this.setStatus('connected', 'Connected')
        }
      }
    }
  }

  private addMessage(text: string, role: TranscriptEntry['role']): void {
    if (!text.trim()) return
    this.transcript.push({ role, text })
    const div = document.createElement('div')
    div.className = `msg ${role}`
    div.textContent = text
    this.transcriptEl.appendChild(div)
    this.transcriptEl.scrollTop = this.transcriptEl.scrollHeight
  }

  private setMicIcon(recording: boolean): void {
    while (this.talkBtn.firstChild) this.talkBtn.removeChild(this.talkBtn.firstChild)
    this.talkBtn.appendChild(recording ? createMicOffIcon() : createMicIcon())
  }

  private async startRecording(): Promise<void> {
    console.log('[claw-voice] startRecording called, isRecording:', this.isRecording, 'audioInited:', this.audioInited)
    if (this.isRecording) return

    if (!this.audioInited) {
      try {
        console.log('[claw-voice] initAudio from startRecording')
        await this.initAudio()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('[claw-voice] initAudio failed in startRecording:', msg)
        this.addMessage(`Microphone access failed: ${msg}`, 'system')
        return
      }
    }

    this.bargeIn()
    this.duckPlayback(true)
    this.isRecording = true
    this.talkBtn.classList.add('active')
    this.talkBtn.classList.remove('speaking')
    this.setMicIcon(true)
    this.setStatus('recording', 'Listening...')
  }

  private stopRecording(): void {
    if (!this.isRecording) return
    this.isRecording = false
    this.duckPlayback(false)
    this.talkBtn.classList.remove('active')
    this.talkBtn.style.setProperty('--mic-level', '0')
    this.setMicIcon(false)
    this.setStatus('connected', 'Processing...')

    if (!this.isHandsFree && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'commit' }))
    }

    this.clearProcessingTimeout()
    this.processingTimeout = setTimeout(() => {
      if (this.statusTextEl.textContent === 'Processing...') {
        this.setStatus('connected', 'Connected')
      }
    }, 15_000)
  }

  private setStatus(state: string, text: string): void {
    this.statusDot.className = 'status-dot' + (state ? ` ${state}` : '')
    this.statusTextEl.textContent = text
  }

  private clearProcessingTimeout(): void {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout)
      this.processingTimeout = null
    }
  }

  private async acquireWakeLock(): Promise<void> {
    if (this.wakeLock || !('wakeLock' in navigator)) return
    try {
      this.wakeLock = await navigator.wakeLock.request('screen')
      this.wakeLock.addEventListener('release', () => { this.wakeLock = null })
    } catch { /* wake lock not available or denied */ }
  }

  private releaseWakeLock(): void {
    this.wakeLock?.release()
    this.wakeLock = null
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private emit(name: string, detail: Record<string, unknown>): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }))
  }

  private loadPrefs(): void {
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      if (!raw) return
      const prefs: VoicePrefs = JSON.parse(raw)
      if (prefs.provider) this.currentProvider = prefs.provider
      if (prefs.mode) this.isHandsFree = prefs.mode === 'hands-free'
      if (prefs.voices?.[this.currentProvider]) {
        this.currentVoice = prefs.voices[this.currentProvider]
      }
    } catch { /* ignore corrupt prefs */ }
  }

  private savePrefs(): void {
    const existing = this.readPrefsRaw()
    const voices = existing.voices || {}
    voices[this.currentProvider] = this.currentVoice
    const prefs: VoicePrefs = {
      provider: this.currentProvider,
      voices,
      mode: this.isHandsFree ? 'hands-free' : 'push-to-talk',
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  }

  private readPrefsRaw(): Partial<VoicePrefs> {
    try {
      const raw = localStorage.getItem(PREFS_KEY)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  }

  private populateVoiceSelect(): void {
    while (this.voiceSelect.firstChild) this.voiceSelect.removeChild(this.voiceSelect.firstChild)
    const voices = this.providerVoices[this.currentProvider] || []
    for (const v of voices) {
      const opt = document.createElement('option')
      opt.value = v
      opt.textContent = v
      this.voiceSelect.appendChild(opt)
    }
    // Restore saved voice for this provider, or default to first
    const saved = this.readPrefsRaw().voices?.[this.currentProvider]
    if (saved && voices.includes(saved)) {
      this.currentVoice = saved
    } else {
      this.currentVoice = voices[0] || ''
    }
    this.voiceSelect.value = this.currentVoice
  }

  private cleanup(): void {
    this.clearProcessingTimeout()
    this.stopHeartbeat()
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    this.intentionalClose = true
    this.releaseWakeLock()
    if (this.ws) { this.ws.close(); this.ws = null }
    if (this.micStream) { this.micStream.getTracks().forEach(t => t.stop()); this.micStream = null }
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null }
  }
}

customElements.define('claw-voice', ClawVoice)
