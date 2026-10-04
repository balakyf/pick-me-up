import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CombatLog, CombatUnitInit } from '../../engine/types'
import type { Snap } from '../battle/battleFrames'
import { bossName, introOf } from '../battle/bossIntro'
import { allyBustUrl, enemyUrl, iselBustUrl } from '../pixel/sprites'
import { t } from '../i18n/i18n'
import { STORY_MS, storyAt, storyBeats, victoryLine, type StoryLine } from './storyBeats'
import './story.css'

/** Who is talking: the name over the box and the face beside it. */
function voiceOf(line: StoryLine, byId: Record<string, CombatUnitInit>): { name: string | null; face: string | null; boss: boolean; color?: string } {
  switch (line.speaker) {
    case 'boss': {
      const u = line.unitId !== undefined ? byId[line.unitId] : undefined
      return { name: u ? bossName(u) : null, face: u ? enemyUrl(u.name, u.element) : null, boss: true, color: introOf(u?.templateId)?.color }
    }
    case 'isel':
      return { name: t('Isel'), face: iselBustUrl(), boss: false }
    case 'priasis':
      return { name: t('Princess Priasis'), face: allyBustUrl('Princess Priasis'), boss: false }
    case 'keyBearer':
      return { name: t('Key Bearer'), face: allyBustUrl('Key Bearer'), boss: false }
    case 'narrator':
      return { name: null, face: null, boss: false }
  }
}

/** The JRPG text box: a face, a name, a line. Screen space, never in the way of a click. */
export function StoryBox({ line, byId, calm, ending = false }: { line: StoryLine; byId: Record<string, CombatUnitInit>; calm: boolean; ending?: boolean }) {
  const v = voiceOf(line, byId)
  return (
    <div
      className={`story-box side-${line.speaker === 'boss' || line.speaker === 'narrator' ? 'foe' : 'ally'} ${line.narrated ? 'narrated' : ''} ${v.boss ? 'boss' : ''} ${calm ? 'calm' : ''} ${ending ? 'ending' : ''} k-${line.kind}`}
      style={v.color ? { ['--boss-color' as string]: v.color } : undefined}
      role="status"
      aria-live="polite"
    >
      {v.face && <img className={`px story-face ${v.boss ? 'foe' : ''}`} src={v.face} alt="" />}
      <div className="story-say">
        {v.name && <div className="story-name">{v.name}</div>}
        <div className="story-text">{line.narrated ? t(line.text) : `“${t(line.text)}”`}</div>
      </div>
    </div>
  )
}

/**
 * The battle's story layer (lane M). BattleScene mounts what this returns in screen space.
 * A line starts on its beat, holds STORY_MS (at the replay's speed) even if the replay
 * moves on, and gives way to the next line; at the end of a lost fight the boss who won
 * has the last word.
 */
export function useStoryBox({
  log,
  byId,
  snap,
  atEnd,
  speed,
  reduced,
}: {
  log: CombatLog
  byId: Record<string, CombatUnitInit>
  snap: Pick<Snap, 'from' | 'to'>
  atEnd: boolean
  speed: number
  reduced: boolean
}): ReactNode {
  const lines = useMemo(() => storyBeats(log, byId), [log, byId])
  const last = useMemo(() => victoryLine(log, byId), [log, byId])
  const found = atEnd ? null : storyAt(lines, snap.from, snap.to)
  const foundKey = found ? `${found.at}|${log.seed}|${log.events.length}` : null
  const [shown, setShown] = useState<{ key: string; line: StoryLine } | null>(null)

  useEffect(() => {
    if (found && foundKey) setShown({ key: foundKey, line: found.line })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foundKey])
  useEffect(() => {
    if (!shown) return
    const ms = STORY_MS[shown.line.kind]
    if (ms <= 0) return
    const tm = setTimeout(() => setShown((cur) => (cur?.key === shown.key ? null : cur)), ms / Math.max(1, speed))
    return () => clearTimeout(tm)
  }, [shown, speed])

  if (atEnd) return last ? <StoryBox key="story-end" line={last} byId={byId} calm={reduced} ending /> : null
  if (!shown) return null
  return <StoryBox key={shown.key} line={shown.line} byId={byId} calm={reduced} />
}
