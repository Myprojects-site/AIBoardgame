// 모든 게임이 따르는 규칙 모듈 모양 (기획서 2.2장)
import type { Rng } from './rng.ts'

export type PlayerId = string

export type OptionValue = number | string | boolean
export type Options = Record<string, OptionValue>

export interface OptionSpec {
  id: string
  label: string
  /** players가 있으면 그 인원일 때만 고를 수 있다. 방 화면은 인원이 바뀌면 고를 수 없는 값을 기본값으로 되돌린다. */
  choices: { value: OptionValue; label: string; players?: number[] }[]
  default: OptionValue
}

export function choiceAllowed(spec: OptionSpec, value: OptionValue, players: number): boolean {
  const choice = spec.choices.find((c) => c.value === value)
  return !!choice && (!choice.players || choice.players.includes(players))
}

export interface GameResult {
  ranking: { player: PlayerId; score: number; place: number }[]
  reason: string
}

// 튜토리얼 (기획서 3.4장): 연습 판에서 단계마다 보여 주고, 몇 단계는 직접 해 본다.
// 연습 판은 나와 안내 캐릭터(id 'guide') 둘이 앉고, 내가 선.
export const TUTORIAL_GUIDE = 'guide'

export interface TutorialStep {
  id: string
  title: string
  text: string // {target} 자리에 목표 점수
  guide: string // 안내 캐릭터 말
  focus: string[] // 밝힐 곳. 게임 판이 알아듣는 이름 (한양 상단: supply, patrons, mine, market:단계, market:단계:칸, deck:단계)
  board?: string // 이 단계에 들어갈 때 연습 판을 이렇게 꾸민다 (규칙 모듈 tutorialBoard)
  waitFor?: string // 이 종류 행동을 해야 다음으로 (예: 'take3')
  hint?: string // 다른 행동을 했을 때
  after?: string // 해 보고 나서 안내 캐릭터 말
}

export class IllegalAction extends Error {}

export interface GameRules<State, Action, View> {
  id: string
  name: string
  players: { min: number; max: number }
  options: OptionSpec[]
  tutorial: TutorialStep[]
  /** 튜토리얼 연습 판 꾸미기 (TutorialStep.board 이름마다) */
  tutorialBoard?(board: string, state: State, me: PlayerId): State
  /** players는 차례 순서. 맨 앞 사람이 먼저 둔다 (방이 주사위로 정해서 넘긴다) */
  setup(players: PlayerId[], seed: number, options: Options): State
  currentPlayer(state: State): PlayerId | null
  legalActions(state: State, player: PlayerId): Action[]
  /** 틀린 행동이면 IllegalAction을 던진다. state는 바꾸지 않고 새 상태를 돌려준다. */
  apply(state: State, player: PlayerId, action: Action): State
  result(state: State): GameResult | null
  view(state: State, viewer: PlayerId | 'spectator'): View
  /** 0~1. 신분 아바타(기획서 3.5장)에 쓴다 */
  progress(state: State, player: PlayerId): number
  /** 빈자리·자리 비운 사람 대신 둘 때 */
  bot(state: State, player: PlayerId, rng: Rng): Action
}
