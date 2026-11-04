// 게임마다 판을 그리는 함수. 규칙 모듈 목록(@aibg/shared/games)과 짝을 맞춘다.
import type { RoomView, TablePoint } from '@aibg/shared/room'
import { hanyangBoard } from './hanyang/view.ts'

export interface BoardCtx {
  room: RoomView
  me: string
  label(player: string): HTMLElement // 이름 + 색 + 신분
  nameOf(player: string): string
  colorOf(player: string): string
  act(action: unknown): void
  /** 내 손 위치·보는 것 (기획서 3.3장) */
  presence(at: TablePoint | null, hover: string | null): void
  react(emoji: string): void
  redraw(): void
}

export const BOARDS: Record<string, (ctx: BoardCtx) => HTMLElement> = {
  hanyang: hanyangBoard,
}
