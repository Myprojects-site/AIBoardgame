// 한양 상단 규칙 (기획서 4장). 서버가 판정에, 클라이언트가 미리보기에, 시뮬레이션이 밸런스 확인에 쓴다.
import {
  IllegalAction,
  choiceAllowed,
  type GameResult,
  type OptionSpec,
  type Options,
  type PlayerId,
} from '../core/types.ts'
import { makeRng, shuffle } from '../core/rng.ts'
import { COLORS, RULES, TIERS, TOKENS, WILD, type Color, type Token } from './constants.ts'
import { CARDS } from './data/cards.gen.ts'
import { PATRONS } from './data/patrons.ts'
import type {
  CardDef,
  CardId,
  HanyangAction,
  HanyangState,
  HanyangView,
  PatronDef,
  PlayerState,
  Tier,
  TokenCount,
} from './types.ts'

export const TARGET_OPTION: OptionSpec = {
  id: 'target',
  label: '목표 점수',
  choices: RULES.targetChoices.map((v) => ({ value: v, label: `${v}점`, players: RULES.targetPlayers[v] })),
  default: RULES.defaultTarget,
}

const CARD_BY_ID = new Map(CARDS.map((c) => [c.id, c]))
const PATRON_BY_ID = new Map(PATRONS.map((p) => [p.id, p]))

export function card(id: CardId): CardDef {
  const c = CARD_BY_ID.get(id)
  if (!c) throw new Error(`없는 카드: ${id}`)
  return c
}

export function patron(id: string): PatronDef {
  const p = PATRON_BY_ID.get(id)
  if (!p) throw new Error(`없는 명사: ${id}`)
  return p
}

export function emptyTokens(): TokenCount {
  return { cheong: 0, jeok: 0, hwang: 0, baek: 0, heuk: 0, yeop: 0 }
}

export function tokenTotal(t: TokenCount): number {
  return TOKENS.reduce((sum, k) => sum + t[k], 0)
}

export function bonusOf(p: PlayerState): Record<Color, number> {
  const b = { cheong: 0, jeok: 0, hwang: 0, baek: 0, heuk: 0 }
  for (const id of p.cards) b[card(id).color]++
  return b
}

export function pointsOf(p: PlayerState): number {
  let sum = 0
  for (const id of p.cards) sum += card(id).points
  for (const id of p.patrons) sum += patron(id).points
  return sum
}

/** 이 카드를 사려면 낼 토큰. 못 사면 null. 같은 색 물건을 먼저 내고 모자란 만큼 엽전을 낸다. */
export function payment(p: PlayerState, c: CardDef): TokenCount | null {
  const bonus = bonusOf(p)
  const pay = emptyTokens()
  let wild = 0
  for (const color of COLORS) {
    const need = Math.max(0, (c.cost[color] ?? 0) - bonus[color])
    const use = Math.min(need, p.tokens[color])
    pay[color] = use
    wild += need - use
  }
  if (wild > p.tokens[WILD]) return null
  pay[WILD] = wild
  return pay
}

export function eligiblePatrons(s: HanyangState, p: PlayerState): string[] {
  const bonus = bonusOf(p)
  return s.patrons.filter((id) => COLORS.every((c) => bonus[c] >= (patron(id).need[c] ?? 0)))
}

export function activePlayer(s: HanyangState): PlayerState {
  return s.players[s.current]!
}

function combinations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]]
  const out: T[][] = []
  items.forEach((item, i) => {
    for (const rest of combinations(items.slice(i + 1), k - 1)) out.push([item, ...rest])
  })
  return out
}

function actionKey(a: HanyangAction): string {
  if (a.type === 'take3') return JSON.stringify({ ...a, colors: COLORS.filter((c) => a.colors.includes(c)) })
  return JSON.stringify(a)
}

export function setup(players: PlayerId[], seed: number, options: Options): HanyangState {
  if (players.length < RULES.minPlayers || players.length > RULES.maxPlayers) {
    throw new Error(`인원은 ${RULES.minPlayers}~${RULES.maxPlayers}명`)
  }
  const target = Number(options.target ?? RULES.defaultTarget)
  if (!choiceAllowed(TARGET_OPTION, target, players.length)) {
    throw new Error(`${players.length}인은 목표 점수 ${target}점을 고를 수 없음`)
  }

  const rng = makeRng(seed)
  const supply = emptyTokens()
  for (const c of COLORS) supply[c] = RULES.tokensPerColor[players.length]!
  supply[WILD] = RULES.wildTokens

  const decks = {} as Record<Tier, CardId[]>
  const market = {} as Record<Tier, (CardId | null)[]>
  for (const tier of TIERS) {
    decks[tier] = shuffle(
      CARDS.filter((c) => c.tier === tier).map((c) => c.id),
      rng,
    )
    market[tier] = decks[tier].splice(0, RULES.marketSlots)
  }
  const patrons = shuffle(
    PATRONS.map((p) => p.id),
    rng,
  ).slice(0, players.length + RULES.extraPatrons)
  // players는 차례 순서대로 온다(방에서 주사위로 정함). 맨 앞 사람이 선.
  const first = 0
  // 뒷자리 시작 물건: 서로 다른 색을 차례로 나눠 준다
  const startColors = shuffle(COLORS, rng)
  let nextColor = 0
  const seats = players.map((id, i) => {
    const tokens = emptyTokens()
    const order = (i - first + players.length) % players.length
    for (let k = 0; k < RULES.startTokensBySeat[players.length]![order]!; k++) {
      move(supply, tokens, startColors[nextColor++ % COLORS.length]!)
    }
    return { id, tokens, cards: [], reserved: [], patrons: [] }
  })

  return {
    players: seats,
    first,
    current: first,
    round: 1,
    phase: 'play',
    supply,
    decks,
    market,
    patrons,
    patronChoices: [],
    target,
    endTriggered: false,
    endReason: null,
    lastPurchaseRound: 0,
  }
}

export function legalActions(s: HanyangState, player: PlayerId): HanyangAction[] {
  if (s.phase === 'over') return []
  const p = activePlayer(s)
  if (p.id !== player) return []

  if (s.phase === 'discard') return TOKENS.filter((t) => p.tokens[t] > 0).map((token) => ({ type: 'discard', token }))
  if (s.phase === 'patron') return s.patronChoices.map((id) => ({ type: 'patron', id }))

  const out: HanyangAction[] = []
  const available = COLORS.filter((c) => s.supply[c] > 0)
  if (available.length >= 3) {
    for (const colors of combinations(available, 3)) out.push({ type: 'take3', colors })
  } else if (available.length > 0) {
    out.push({ type: 'take3', colors: available })
  }
  for (const c of COLORS) if (s.supply[c] >= RULES.take2MinSupply) out.push({ type: 'take2', color: c })

  for (const tier of TIERS) {
    s.market[tier].forEach((id, slot) => {
      if (id === null) return
      if (payment(p, card(id))) out.push({ type: 'buy', tier, slot })
      if (p.reserved.length < RULES.maxReserved) out.push({ type: 'reserve', tier, slot })
    })
    if (p.reserved.length < RULES.maxReserved && s.decks[tier].length > 0) {
      out.push({ type: 'reserve', tier, slot: 'deck' })
    }
  }
  p.reserved.forEach((r, index) => {
    if (payment(p, card(r.card))) out.push({ type: 'buyReserved', index })
  })

  if (out.length === 0) out.push({ type: 'pass' })
  return out
}

function move(from: TokenCount, to: TokenCount, token: Token, n = 1): void {
  from[token] -= n
  to[token] += n
}

function refill(s: HanyangState, tier: Tier, slot: number): void {
  s.market[tier][slot] = s.decks[tier].shift() ?? null
}

function purchase(s: HanyangState, p: PlayerState, id: CardId): void {
  const pay = payment(p, card(id))!
  for (const t of TOKENS) move(p.tokens, s.supply, t, pay[t])
  p.cards.push(id)
  s.lastPurchaseRound = s.round
}

function exhaustedTiers(s: HanyangState): number {
  return TIERS.filter((t) => s.decks[t].length === 0 && s.market[t].every((id) => id === null)).length
}

function endTurn(s: HanyangState): void {
  s.phase = 'play'
  s.patronChoices = []
  if (pointsOf(activePlayer(s)) >= s.target) s.endTriggered = true

  s.current = (s.current + 1) % s.players.length
  if (s.current !== s.first) return

  // 한 바퀴가 끝났다
  if (s.endTriggered) s.endReason = 'target'
  else if (exhaustedTiers(s) >= 2) s.endReason = 'exhausted'
  else if (s.round >= RULES.stallAfterRound && s.round - s.lastPurchaseRound >= RULES.stallRounds) s.endReason = 'stall'
  else if (s.round >= RULES.maxRounds) s.endReason = 'limit'

  if (s.endReason) s.phase = 'over'
  else s.round++
}

/** 행동 뒤 정리: 물건 10개 초과 → 되돌리기, 그다음 명사 방문, 그다음 차례 넘김 */
function resolve(s: HanyangState): void {
  const p = activePlayer(s)
  if (tokenTotal(p.tokens) > RULES.maxTokens) {
    s.phase = 'discard'
    return
  }
  const eligible = eligiblePatrons(s, p)
  if (eligible.length > 1) {
    s.phase = 'patron'
    s.patronChoices = eligible
    return
  }
  if (eligible.length === 1) takePatron(s, p, eligible[0]!)
  endTurn(s)
}

function takePatron(s: HanyangState, p: PlayerState, id: string): void {
  s.patrons = s.patrons.filter((x) => x !== id)
  p.patrons.push(id)
}

export function apply(state: HanyangState, player: PlayerId, action: HanyangAction): HanyangState {
  const key = actionKey(action)
  if (!legalActions(state, player).some((a) => actionKey(a) === key)) {
    throw new IllegalAction(`할 수 없는 행동: ${key}`)
  }
  const s = structuredClone(state)
  const p = activePlayer(s)

  switch (action.type) {
    case 'take3':
      for (const c of action.colors) move(s.supply, p.tokens, c)
      resolve(s)
      break
    case 'take2':
      move(s.supply, p.tokens, action.color, 2)
      resolve(s)
      break
    case 'reserve': {
      const blind = action.slot === 'deck'
      const id = blind ? s.decks[action.tier].shift()! : s.market[action.tier][action.slot as number]!
      if (!blind) refill(s, action.tier, action.slot as number)
      p.reserved.push({ card: id, blind })
      if (s.supply[WILD] > 0) move(s.supply, p.tokens, WILD)
      resolve(s)
      break
    }
    case 'buy': {
      const id = s.market[action.tier][action.slot]!
      purchase(s, p, id)
      refill(s, action.tier, action.slot)
      resolve(s)
      break
    }
    case 'buyReserved': {
      const [r] = p.reserved.splice(action.index, 1)
      purchase(s, p, r!.card)
      resolve(s)
      break
    }
    case 'discard':
      move(p.tokens, s.supply, action.token)
      resolve(s)
      break
    case 'patron':
      takePatron(s, p, action.id)
      endTurn(s)
      break
    case 'pass':
      endTurn(s)
      break
  }
  return s
}

export function result(s: HanyangState): GameResult | null {
  if (s.phase !== 'over') return null
  const rows = s.players.map((p) => ({ player: p.id, score: pointsOf(p), cards: p.cards.length }))
  // 높은 점수, 같으면 산 카드가 적은 쪽이 앞. 둘 다 같으면 같은 등수.
  const better = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    a.score > b.score || (a.score === b.score && a.cards < b.cards)
  const ranking = rows
    .map((r) => ({ player: r.player, score: r.score, place: 1 + rows.filter((o) => better(o, r)).length }))
    .sort((a, b) => a.place - b.place)
  return { ranking, reason: s.endReason! }
}

export function view(s: HanyangState, viewer: PlayerId | 'spectator'): HanyangView {
  const { decks, players, ...rest } = structuredClone(s)
  return {
    ...rest,
    decks: { 1: decks[1].length, 2: decks[2].length, 3: decks[3].length },
    players: players.map((p) => ({
      ...p,
      reserved: p.reserved.map((r) => ({ blind: r.blind, card: r.blind && p.id !== viewer ? null : r.card })),
    })),
  }
}
