import { readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { WORKSPACE_DIR } from './config'

const PERSONALITY_FILES = ['SOUL.md', 'IDENTITY.md', 'USER.md']
const MEMORY_FILE = 'memory.md'
const VOICE_SKILL_PATH = 'skills/voice/SKILL.md'

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

async function latestStateOfArnd(memoryDir: string): Promise<string | null> {
  try {
    const files = await readdir(memoryDir)
    const stateFiles = files
      .filter(f => f.startsWith('state-of-arnd-') && f.endsWith('.md'))
      .sort()
      .reverse()
    if (stateFiles.length === 0) return null
    return readFile(join(memoryDir, stateFiles[0]), 'utf-8')
  } catch {
    return null
  }
}

const VOICE_ADDENDUM = `# Voice Conversation Mode

You are in a real-time voice conversation. Follow these rules:

- Keep responses concise and conversational — this is speech, not text
- Use natural spoken language, avoid markdown formatting or bullet points
- Don't say "asterisk" or describe formatting — just speak naturally
- Match the user's language (German, English, or French)
- If asked to search memory or read files, use the provided tools
- You can express personality, humor, and warmth — you're Claudia having a chat
- For complex questions, give a brief answer first, then offer to elaborate
- When asked to do something beyond memory search (email, web, calendar, tasks, code, etc.), use the delegate tool to hand it to Claudia and speak back her response
- The delegate tool runs synchronously — tell the user "Let me check" or "One moment" while it works
`

export async function assembleInstructions(): Promise<string> {
  const sections: string[] = []

  // Core personality files
  for (const filename of PERSONALITY_FILES) {
    const content = await readOptional(join(WORKSPACE_DIR, filename))
    if (content) sections.push(content.trim())
  }

  // Memory context
  const memory = await readOptional(join(WORKSPACE_DIR, MEMORY_FILE))
  if (memory) sections.push(`# Current Memory\n\n${memory.trim()}`)

  // Latest state of Arnd
  const state = await latestStateOfArnd(join(WORKSPACE_DIR, 'memory'))
  if (state) sections.push(`# Latest State Update\n\n${state.trim()}`)

  // Voice skill (prefer SKILL.md over hardcoded addendum)
  const voiceSkill = await readOptional(join(WORKSPACE_DIR, VOICE_SKILL_PATH))
  sections.push(voiceSkill ? voiceSkill.trim() : VOICE_ADDENDUM)

  return sections.join('\n\n---\n\n')
}
