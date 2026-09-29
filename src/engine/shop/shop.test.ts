import { describe, it, expect } from 'vitest'
import { buyPackage, claimLogin, claimMonthly, packagePrice, todayOffer, frustrationDeal, baitRevealed, shownStar, nextStreak } from './shop'
import { createAccount } from '../account'
import { summonMany } from '../gacha'
import { TUNING } from '../tuning'
import type { GameState, HeroId } from '../types'

const S = TUNING.shop
const DAY = 24 * 3_600_000

describe('the predatory layer (simulated money)', () => {
  it('packages grant currency and record a simulated spend — never a real payment', () => {
    const s = createAccount(1)
    const after = buyPackage(s, 'satchel', 5 * DAY)
    expect(after.gems).toBe(s.gems + S.packages.satchel!.gems)
    expect(after.meta.wallet.spentUsd).toBe(packagePrice('satchel', 5))
    expect(after.meta.wallet.purchases.satchel).toBe(1)
  })

  it('one package a day is discounted (FOMO)', () => {
    const offer = todayOffer(3)
    expect(packagePrice(offer, 3)).toBeLessThan(S.packages[offer]!.usd)
    expect(todayOffer(3)).not.toBe(todayOffer(4))
  })

  it('the Monthly Package pays 150 gems + 10,000 gold a day for 30 days (canon)', () => {
    let s = buyPackage(createAccount(1), 'monthly', 0)
    expect(() => buyPackage(s, 'monthly', 0)).toThrow(/already/)
    for (let d = 0; d < S.monthlyDays; d++) s = claimMonthly(s, d * DAY)
    expect(s.gems).toBe(S.monthlyDays * S.monthlyGems)
    expect(s.gold).toBe(createAccount(1).gold + S.monthlyDays * S.monthlyGold)
    expect(s.meta.monthly).toBeNull()
    expect(() => claimMonthly(s, 40 * DAY)).toThrow(/no Monthly/)
  })

  it('the login streak builds to a 7th-day bonus and resets after a missed day', () => {
    let s: GameState = createAccount(1)
    for (let d = 0; d < 7; d++) s = claimLogin(s, d * DAY)
    expect(s.meta.login.streak).toBe(7)
    expect(s.gems).toBe(7 * S.loginGems + S.streakBonusGems)
    expect(() => claimLogin(s, 6 * DAY)).toThrow(/already/)
    expect(nextStreak(s, 9 * DAY)).toBe(1)
    expect(s.meta.pi).toBe(7 * TUNING.interference.perLogin)
  })

  it('a long dry Advanced streak surfaces the "so close!" deal', () => {
    const s = createAccount(1)
    expect(frustrationDeal(s)).toBe(false)
    expect(() => buyPackage(s, 'so_close', 0)).toThrow(/not on offer/)
    const dry = { ...s, gacha: { ...s.gacha, advPity4: S.frustrationPity } }
    expect(frustrationDeal(dry)).toBe(true)
    expect(buyPackage(dry, 'so_close', 0).gems).toBe(S.packages.so_close!.gems)
  })

  it('whale-bait shows a 3★ as 4★ after a dry streak, until the goddess’s lie is revealed', () => {
    let baited = null
    for (let seed = 1; seed <= 40 && !baited; seed++) {
      const acct = createAccount(seed)
      const s = { ...acct, gems: 1_000_000, gacha: { ...acct.gacha, advPity4: S.baitPity } }
      baited = summonMany(s, 'advanced', 1).heroes.find((h) => h.displayStar !== undefined) ?? null
    }
    expect(baited).not.toBeNull()
    expect(baited!.star).toBe(3)
    expect(shownStar(baited!, 1)).toBe(4)
    expect(baitRevealed(baited!, S.revealMasterLevel)).toBe(true)
    expect(shownStar(baited!, S.revealMasterLevel)).toBe(3)
    expect(shownStar({ ...baited!, id: 'h_x' as HeroId, xp: { ...baited!.xp, atCap: true } }, 1)).toBe(3)
  })
})
