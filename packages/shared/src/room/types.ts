// 방 (기획서 2.1, 2.1.1, 2.4장). 방장 브라우저가 RoomState 전체를 들고, 사람마다 RoomView만 보낸다.
import type { Rank } from '../core/rank.ts'
import type { GameResult, Options, PlayerId } from '../core/types.ts'

export const TURN_LIMITS = [0, 60, 120, 180] as const
export type TurnLimit = (typeof TURN_LIMITS)[number]

export interface Member {
  id: string
  name: string
  color: string
  connected: boolean
}

export interface ChatLine {
  from: string | null // null = 알림
  text: string
  at: number
}

export interface RoomSettings {
  game: string
  seats: number
  tutorial: boolean
  fillBots: boolean
  turnLimit: TurnLimit // 초. 0 = 없음. 넘기면 알림만
  spectators: boolean
  options: Options
}

export type RoomPhase = 'lobby' | 'playing' | 'over'

export interface RoomState {
  v: 1
  code: string
  hostId: string
  members: Member[] // 들어온 순서
  seats: (string | null)[] // 자리마다 멤버 id. 게임 중에는 봇 id(bot:1)도
  settings: RoomSettings
  phase: RoomPhase
  seed: number
  players: PlayerId[] // 게임 시작 때 자리 순서 그대로
  game: unknown
  standIn: PlayerId[] // 봇이 대신 두는 사람
  result: GameResult | null
  chat: ChatLine[]
  turnStartedAt: number
  actions: number
}

/** 참가자(방장 포함) → 방장 */
export type ClientMsg =
  | { t: 'hello'; id: string; name: string; color: string }
  | { t: 'sit'; seat: number }
  | { t: 'stand' }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'act'; action: unknown }
  | { t: 'chat'; text: string }
  | { t: 'standIn'; player: PlayerId; on: boolean }
  | { t: 'again' }

export interface RoomView {
  code: string
  you: string
  hostId: string
  members: Member[]
  seats: (string | null)[]
  settings: RoomSettings
  phase: RoomPhase
  players: PlayerId[]
  game: unknown // 규칙 모듈의 view(): 숨긴 정보는 가려져 있다
  legal: unknown[] // 지금 내가 할 수 있는 행동
  current: PlayerId | null
  ranks: Record<PlayerId, Rank>
  result: GameResult | null
  chat: ChatLine[]
  standIn: PlayerId[]
  turnStartedAt: number
  now: number
}

/** 방장 → 참가자 */
export type HostMsg =
  | { t: 'room'; view: RoomView }
  | { t: 'error'; text: string }
  | { t: 'becomeHost'; room: RoomState } // 방장 넘기기
