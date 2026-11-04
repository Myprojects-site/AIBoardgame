// 한양 상단 봇. 밸런스 시뮬레이션과 빈자리 채우기(기획서 2.1.1장)에 쓴다.
// 사람처럼 "노리는 카드"를 정하고 그 카드에 모자란 물건을 모은다. 살 수 있는 카드 중 가치가 가장 큰 것을 산다.
import type { PlayerId } from '../core/types.ts'
import type { Rng } from '../core/rng.ts'
import { COLORS, RULES, TIERS, WILD, type Color } from './constants.ts'
import { activePlayer, bonusOf, card, legalActions, patron, pointsOf, tokenTotal } from './rules.ts'
import type { CardDef, CardId, HanyangAction, HanyangState, PlayerState } from './types.ts'

export interface BotOptions {
  /** 이 색 할인을 특히 좋아한다 (한 색 몰기 전략 시험용) */
  focus?: Color
  /** 좋은 카드를 미리 찜해 두는 정도 */
  reserveChance?: number
  /** 같은 상황에서 늘 같은 수를 두지 않게 하는 흔들림 */
  noise?: number
}

interface Target {
  id: CardId
  def: CardDef
  value: number
  deficit: Record<Color, number> // 할인·물건을 빼고 모자란 개수 (엽전은 아직 안 씀)
  missing: number // 엽전까지 쓰고도 모자란 개수
  reserved: boolean
}

function bonusWorth(s: HanyangState, color: Color, bonus: Record<Color, number>, opt: BotOptions): number {
  let worth = 0.6
  if (opt.focus === color) worth += 1.2
  // 명사 조건에 가까워지는 만큼
  for (const id of s.patrons) {
    const need = patron(id).need
    const short = COLORS.reduce((sum, c) => sum + Math.max(0, (need[c] ?? 0) - bonus[c]), 0)
    if ((need[color] ?? 0) > bonus[color]) worth += patron(id).points / Math.max(2, short)
  }
  // 공개된 비싼 카드들이 이 색을 얼마나 원하는지
  for (const tier of [2, 3] as const) {
    for (const id of s.market[tier]) {
      if (id && (card(id).cost[color] ?? 0) > bonus[color]) worth += 0.08
    }
  }
  return worth
}

function evaluate(s: HanyangState, p: PlayerState, opt: BotOptions, rng: Rng): Target[] {
  const bonus = bonusOf(p)
  const progress = Math.min(1, pointsOf(p) / s.target)
  const noise = opt.noise ?? 0.15
  const list: { id: CardId; reserved: boolean }[] = []
  for (const tier of TIERS) for (const id of s.market[tier]) if (id) list.push({ id, reserved: false })
  for (const r of p.reserved) list.push({ id: r.card, reserved: true })

  return list.map(({ id, reserved }) => {
    const def = card(id)
    const deficit = { cheong: 0, jeok: 0, hwang: 0, baek: 0, heuk: 0 }
    let short = 0
    for (const c of COLORS) {
      deficit[c] = Math.max(0, (def.cost[c] ?? 0) - bonus[c] - p.tokens[c])
      short += deficit[c]
    }
    // 끝에 가까울수록 점수, 처음일수록 할인을 본다
    const value =
      def.points * (1 + progress) + bonusWorth(s, def.color, bonus, opt) * (1 - 0.7 * progress) + rng() * noise
    return { id, def, value, deficit, missing: Math.max(0, short - p.tokens[WILD]), reserved }
  })
}

function rankTargets(targets: Target[]): Target[] {
  return [...targets].sort((a, b) => b.value / (1 + b.missing) - a.value / (1 + a.missing))
}

export function chooseAction(s: HanyangState, me: PlayerId, rng: Rng, opt: BotOptions = {}): HanyangAction {
  const legal = legalActions(s, me)
  if (legal.length === 0) throw new Error('내 차례가 아니다')
  if (legal.length === 1) return legal[0]!
  const p = activePlayer(s)

  if (s.phase === 'patron') {
    return legal.reduce((best, a) =>
      a.type === 'patron' && best.type === 'patron' && patron(a.id).points > patron(best.id).points ? a : best,
    )
  }

  const ranked = rankTargets(evaluate(s, p, opt, rng))
  // 앞쪽 노리는 카드일수록 무겁게 쳐서 색마다 "얼마나 필요한지"
  const want = { cheong: 0, jeok: 0, hwang: 0, baek: 0, heuk: 0 }
  ranked.slice(0, 3).forEach((t, i) => {
    for (const c of COLORS) want[c] += Math.min(t.deficit[c], 3) * [1, 0.5, 0.25][i]!
  })

  if (s.phase === 'discard') {
    let best: HanyangAction = legal[0]!
    let keep = Infinity
    for (const a of legal) {
      if (a.type !== 'discard') continue
      const k = a.token === WILD ? 100 : want[a.token] - p.tokens[a.token] * 0.1
      if (k < keep) {
        keep = k
        best = a
      }
    }
    return best
  }

  // 살 수 있으면 가장 값진 카드를 산다
  const byId = new Map(ranked.map((t) => [t.id, t]))
  let buy: HanyangAction | null = null
  let buyValue = -Infinity
  for (const a of legal) {
    const id = a.type === 'buy' ? s.market[a.tier][a.slot] : a.type === 'buyReserved' ? p.reserved[a.index]!.card : null
    if (!id) continue
    const v = byId.get(id)!.value
    if (v > buyValue) {
      buyValue = v
      buy = a
    }
  }
  const top = ranked[0]
  // 훨씬 좋은 카드가 한 수 앞이면 기다린다
  const waitForTop = top && top.missing <= 1 && buy && top.value > buyValue * 2.5
  if (buy && !waitForTop) return buy

  // 물건 가져오기 점수
  const room = RULES.maxTokens - tokenTotal(p.tokens)
  const usefulness = (c: Color) => (top && top.deficit[c] > 0 ? 1 : 0) + want[c] * 0.5 + 0.05
  let take: HanyangAction | null = null
  let takeScore = -Infinity
  for (const a of legal) {
    let score: number
    let n: number
    if (a.type === 'take3') {
      score = a.colors.reduce((sum, c) => sum + usefulness(c), 0)
      n = a.colors.length
    } else if (a.type === 'take2') {
      score = usefulness(a.color) + (top && top.deficit[a.color] >= 2 ? 1 : want[a.color] * 0.3)
      n = 2
    } else continue
    score -= Math.max(0, n - room) * 0.6 // 넘쳐서 되돌릴 만큼 손해
    score += rng() * 0.05
    if (score > takeScore) {
      takeScore = score
      take = a
    }
  }

  // 찜하기: 좋은 카드를 지켜 두거나, 물건을 가져와도 별 도움이 안 될 때
  const reserveTop = legal.find(
    (a) =>
      a.type === 'reserve' &&
      top &&
      !top.reserved &&
      a.slot !== 'deck' &&
      s.market[a.tier][a.slot] === top.id,
  )
  const lowValueTake = takeScore < 1
  if (reserveTop && top && (lowValueTake || (top.def.tier >= 2 && rng() < (opt.reserveChance ?? 0.12)))) {
    return reserveTop
  }
  if (take) return take
  if (reserveTop) return reserveTop
  const anyReserve = legal.find((a) => a.type === 'reserve')
  return anyReserve ?? legal[0]!
}
