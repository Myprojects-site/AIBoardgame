// 방 (기획서 2.1, 2.1.1, 2.4장). 방장 브라우저가 RoomState 전체를 들고, 사람마다 RoomView만 보낸다.
import type { DiceRoll } from '../core/dice.ts'
import type { Rank } from '../core/rank.ts'
import type { GameResult, Options, PlayerId } from '../core/types.ts'

export const TURN_LIMITS = [0, 60, 120, 180] as const
export type TurnLimit = (typeof TURN_LIMITS)[number]

export interface Member {
  id: string
  name: string
  color: string
  connected: boolean
  photo?: string // 프로필 사진 (작게 줄인 data URL). 방 화면 갱신에는 싣지 않고 photos로 따로 보낸다
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
  players: PlayerId[] // 차례 순서 (게임 시작 때 주사위로 정함)
  dice: DiceRoll[] // 시작 때 굴린 주사위
  tutorialPending: PlayerId[] // 아직 튜토리얼을 보는 사람. 다 끝나야 첫 차례 (기획서 3.4장)
  game: unknown
  standIn: PlayerId[] // 봇이 대신 두는 사람
  result: GameResult | null
  chat: ChatLine[]
  turnStartedAt: number
  actions: number
}

// 같이 하는 느낌 (기획서 3.3장): 저장하지 않고 방장이 바로 다른 사람에게 넘긴다
export const REACTIONS = ['😂', '😮', '👏', '😭', '👍', '에이~'] as const

/** 상 위의 한 점. 가운데는 모두에게 같은 좌표, 사람 자리 위는 그 자리 기준 좌표 */
export type TablePoint = { c: [number, number] } | { p: PlayerId; l: [number, number] }

/** 참가자(방장 포함) → 방장 */
export type ClientMsg =
  | { t: 'presence'; at: TablePoint | null; hover: string | null }
  | { t: 'react'; emoji: string }
  | { t: 'hello'; id: string; name: string; color: string; photo?: string | null }
  | { t: 'sit'; seat: number }
  | { t: 'stand' }
  | { t: 'settings'; settings: Partial<RoomSettings> }
  | { t: 'start' }
  | { t: 'act'; action: unknown }
  | { t: 'chat'; text: string }
  | { t: 'standIn'; player: PlayerId; on: boolean }
  | { t: 'again' }
  | { t: 'tutorialDone' } // 다 봤거나 건너뜀
  | { t: 'tutorialSkipAll' } // 방장: 모두 건너뛰고 시작

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
  dice: DiceRoll[]
  tutorialPending: PlayerId[]
  actions: number // 지금까지 둔 수. 0이면 막 시작한 판
  now: number
}

/** 방장 → 참가자 */
export type HostMsg =
  | { t: 'room'; view: RoomView }
  | { t: 'error'; text: string }
  | { t: 'becomeHost'; room: RoomState } // 방장 넘기기
  | { t: 'photos'; photos: Record<string, string> } // 누가 들어오거나 사진을 바꿀 때만
  | { t: 'presence'; from: string; at: TablePoint | null; hover: string | null }
  | { t: 'react'; from: string; emoji: string }
