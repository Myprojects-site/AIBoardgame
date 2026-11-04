import type { PlayerId } from '../core/types.ts'
import type { Color, Token } from './constants.ts'

export type Tier = 1 | 2 | 3
export type CardId = string
export type Cost = Partial<Record<Color, number>>
export type TokenCount = Record<Token, number>

export interface CardDef {
  id: CardId
  tier: Tier
  color: Color // 산 뒤 영구 할인되는 색
  points: number
  cost: Cost
  name: string
}

export interface PatronDef {
  id: string
  name: string
  points: number
  need: Cost // 할인 카드 수 조건
}

export interface ReservedCard {
  card: CardId
  blind: boolean // 더미에서 안 보고 찜함 → 다른 사람에게 가린다
}

export interface PlayerState {
  id: PlayerId
  tokens: TokenCount
  cards: CardId[]
  reserved: ReservedCard[]
  patrons: string[]
}

export type Phase = 'play' | 'discard' | 'patron' | 'over'
export type EndReason = 'target' | 'exhausted' | 'stall' | 'limit'

export interface HanyangState {
  players: PlayerState[]
  first: number // 선 플레이어 자리. 차례가 여기로 돌아오면 한 바퀴
  current: number
  round: number
  phase: Phase
  supply: TokenCount
  decks: Record<Tier, CardId[]> // [0]이 맨 위
  market: Record<Tier, (CardId | null)[]>
  patrons: string[]
  patronChoices: string[]
  target: number
  endTriggered: boolean
  endReason: EndReason | null
  lastPurchaseRound: number
}

export type HanyangAction =
  | { type: 'take3'; colors: Color[] } // 남은 색이 3가지 미만이면 남은 만큼
  | { type: 'take2'; color: Color }
  | { type: 'reserve'; tier: Tier; slot: number | 'deck' }
  | { type: 'buy'; tier: Tier; slot: number }
  | { type: 'buyReserved'; index: number }
  | { type: 'discard'; token: Token }
  | { type: 'patron'; id: string }
  | { type: 'pass' }

export interface PlayerView extends Omit<PlayerState, 'reserved'> {
  reserved: { card: CardId | null; blind: boolean }[]
}

export interface HanyangView extends Omit<HanyangState, 'decks' | 'players'> {
  decks: Record<Tier, number>
  players: PlayerView[]
}
