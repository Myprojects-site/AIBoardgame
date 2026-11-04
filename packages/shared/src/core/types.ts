// 모든 게임이 따르는 규칙 모듈 모양 (기획서 2.2장)

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

// 기획서 3.4장. 내용은 5단계(튜토리얼)에서 채운다.
export interface TutorialStep {
  board: string
  focus: string[]
  camera?: string
  text: string
  guide?: string
  waitFor?: unknown
}

export class IllegalAction extends Error {}

export interface GameRules<State, Action, View> {
  id: string
  name: string
  players: { min: number; max: number }
  options: OptionSpec[]
  tutorial: TutorialStep[]
  setup(players: PlayerId[], seed: number, options: Options): State
  currentPlayer(state: State): PlayerId | null
  legalActions(state: State, player: PlayerId): Action[]
  /** 틀린 행동이면 IllegalAction을 던진다. state는 바꾸지 않고 새 상태를 돌려준다. */
  apply(state: State, player: PlayerId, action: Action): State
  result(state: State): GameResult | null
  view(state: State, viewer: PlayerId | 'spectator'): View
}
