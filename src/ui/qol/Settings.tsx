import { useEffect, useId, useState, type ReactNode } from 'react'
import { PixelWindow } from '../kit'
import { PxIcon } from '../bits'
import { t } from '../i18n/i18n'
import { useLocale } from '../i18n/useLocale'
import type { Locale } from '../i18n/i18n'
import { osPrefersReducedMotion } from '../motion'
import { sfx } from '../audio/sound'
import {
  BATTLE_SPEEDS,
  MOTION_PREFS,
  TEXT_SPEEDS,
  UI_SCALES,
  charsPerTick,
  resetSettings,
  type MotionPref,
  type Settings as SettingsT,
  type TextSpeed,
} from './settings'
import { useSettings } from './useSettings'
import './settings.css'

/**
 * The Settings window (Game Menu ▸ Settings, or O anywhere outside a battle): sound levels,
 * comfort (reduced motion, screen shake, flashes, the UI scale), the default battle speed,
 * the dialogue's text speed and the language. Every change applies at once and is kept on
 * this device (qol/settings.ts).
 */
export function SettingsWindow({ onClose }: { onClose: () => void }) {
  const [s, update] = useSettings()
  const [locale, setLocale] = useLocale()
  const os = osPrefersReducedMotion()

  const MOTION_LABEL: Record<MotionPref, string> = { auto: t('Auto'), on: t('On'), off: t('Off') }
  const TEXT_LABEL: Record<TextSpeed, string> = { slow: t('Slow'), normal: t('Normal'), fast: t('Fast'), instant: t('Instant') }

  return (
    <PixelWindow title={t('Settings')} icon={<PxIcon name="settings" size={18} />} onClose={onClose}>
      <div className="set-body">
        <Section title={t('Sound')}>
          <Toggle
            label={t('Sound')}
            on={!s.muted}
            onChange={(on) => update({ muted: !on })}
            onText={t('On')}
            offText={t('Off')}
            icon={<PxIcon name={s.muted ? 'sound-off' : 'sound-on'} />}
          />
          <Slider label={t('Master volume')} value={s.masterVolume} disabled={s.muted} onChange={(v) => update({ masterVolume: v })} onCommit={() => sfx('confirm')} />
          <Slider label={t('Music')} value={s.musicVolume} disabled={s.muted} onChange={(v) => update({ musicVolume: v })} />
          <Slider label={t('Sound effects')} value={s.sfxVolume} disabled={s.muted} onChange={(v) => update({ sfxVolume: v })} onCommit={() => sfx('hit', { element: 'fire' })} />
        </Section>

        <Section title={t('Comfort')}>
          <Choice
            label={t('Reduced motion')}
            hint={t('Auto follows your device (now: {state}).', { state: os ? t('On') : t('Off') })}
            value={s.reducedMotion}
            options={MOTION_PREFS.map((m) => ({ value: m, label: MOTION_LABEL[m] }))}
            onChange={(v) => update({ reducedMotion: v })}
          />
          <Toggle label={t('Screen shake')} on={s.screenShake} onChange={(on) => update({ screenShake: on })} onText={t('On')} offText={t('Off')} />
          <Toggle
            label={t('Flashes')}
            hint={t('Skill flares, wave flashes, lightning and the summon’s whiteout.')}
            on={s.flashes}
            onChange={(on) => update({ flashes: on })}
            onText={t('On')}
            offText={t('Off')}
          />
          <Choice
            label={t('Interface size')}
            value={String(s.uiScale)}
            options={UI_SCALES.map((k) => ({ value: String(k), label: `${Math.round(k * 100)}%` }))}
            onChange={(v) => update({ uiScale: Number(v) })}
          />
        </Section>

        <Section title={t('Game')}>
          <Choice
            label={t('Battle speed')}
            hint={t('Every battle starts at this speed.')}
            value={String(s.battleSpeed)}
            options={BATTLE_SPEEDS.map((k) => ({ value: String(k), label: `${k}×` }))}
            onChange={(v) => update({ battleSpeed: Number(v) as SettingsT['battleSpeed'] })}
          />
          <Choice
            label={t('Text speed')}
            value={s.textSpeed}
            options={TEXT_SPEEDS.map((k) => ({ value: k, label: TEXT_LABEL[k] }))}
            onChange={(v) => update({ textSpeed: v })}
          />
          <TextPreview speed={s.textSpeed} />
          <Toggle
            label={t('Isel’s tips')}
            hint={t('A short tip the first time each part of the climb matters.')}
            on={s.coachTips}
            onChange={(on) => update({ coachTips: on })}
            onText={t('On')}
            offText={t('Off')}
          />
          <Choice
            label={t('Language')}
            value={locale}
            options={[
              { value: 'en' as Locale, label: 'English', icon: <PxIcon name="flag-gb" /> },
              { value: 'fr' as Locale, label: 'Français', icon: <PxIcon name="flag-fr" /> },
            ]}
            onChange={(v) => setLocale(v)}
          />
        </Section>

        <div className="set-foot">
          <span className="muted">{t('Settings are kept on this device.')}</span>
          <button className="pbtn ghost" onClick={() => resetSettings()}>
            {t('Reset to defaults')}
          </button>
        </div>
      </div>
    </PixelWindow>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="set-section">
      <h3 className="panel-sub set-title">{title}</h3>
      {children}
    </section>
  )
}

function Row({ label, hint, labelId, children }: { label: string; hint?: string; labelId?: string; children: ReactNode }) {
  return (
    <div className="set-row">
      <div className="set-label">
        <span id={labelId}>{label}</span>
        {hint && <span className="set-hint muted">{hint}</span>}
      </div>
      <div className="set-control">{children}</div>
    </div>
  )
}

/** A volume slider (0–100 in steps of 5) with its value beside it. */
function Slider({
  label,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  label: string
  value: number
  disabled?: boolean
  onChange: (v: number) => void
  /** Played when the thumb is released (a sample of the level). */
  onCommit?: () => void
}) {
  const id = useId()
  return (
    <Row label={label} labelId={id}>
      <input
        type="range"
        className="set-slider"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        aria-labelledby={id}
        aria-valuetext={`${value}%`}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={(e) => (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' ? onCommit?.() : undefined)}
        style={{ ['--fill' as string]: `${value}%` }}
      />
      <span className="set-value">{value}%</span>
    </Row>
  )
}

/** An on/off switch. */
function Toggle({
  label,
  hint,
  on,
  onChange,
  onText,
  offText,
  icon,
}: {
  label: string
  hint?: string
  on: boolean
  onChange: (on: boolean) => void
  onText: string
  offText: string
  icon?: ReactNode
}) {
  const id = useId()
  return (
    <Row label={label} hint={hint} labelId={id}>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={id} className={`set-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}>
        {icon}
        <span className="set-knob" aria-hidden="true" />
        <span>{on ? onText : offText}</span>
      </button>
    </Row>
  )
}

/** One of a few choices, as a row of radio buttons (arrow keys move between them). */
function Choice<V extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string
  hint?: string
  value: V
  options: { value: V; label: string; icon?: ReactNode }[]
  onChange: (v: V) => void
}) {
  const id = useId()
  return (
    <Row label={label} hint={hint} labelId={id}>
      <div className="set-choice" role="radiogroup" aria-labelledby={id}>
        {options.map((o) => (
          <label key={o.value} className={`set-opt ${o.value === value ? 'on' : ''}`}>
            <input type="radio" name={id} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.icon}
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </Row>
  )
}

/** A line typed at the chosen text speed, so the Master sees the pace before a dialogue. */
function TextPreview({ speed }: { speed: TextSpeed }) {
  const line = t('Isel: “Welcome back, Master. The tower waited for you.”')
  const [shown, setShown] = useState(0)
  useEffect(() => setShown(0), [speed, line])
  useEffect(() => {
    const step = charsPerTick(speed)
    if (shown >= line.length) {
      const again = setTimeout(() => setShown(0), 1600)
      return () => clearTimeout(again)
    }
    if (!Number.isFinite(step)) {
      setShown(line.length)
      return
    }
    const tm = setTimeout(() => setShown((n) => Math.min(line.length, n + step)), 22)
    return () => clearTimeout(tm)
  }, [shown, speed, line])
  return (
    <div className="set-preview pframe" aria-hidden="true">
      {line.slice(0, shown)}
      <span className="set-caret">▌</span>
    </div>
  )
}
