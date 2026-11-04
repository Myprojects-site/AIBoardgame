// 게임마다 판을 그리는 함수. 규칙 모듈 목록(@aibg/shared/games)과 짝을 맞춘다.
import type { RoomView } from '@aibg/shared/room'
import { hanyangBoard } from './hanyang/board.ts'

export interface BoardCtx {
  room: RoomView
  me: string
  label(player: string): HTMLElement // 이름 + 색 + 신분
  act(action: unknown): void
  redraw(): void
}

export const BOARDS: Record<string, (ctx: BoardCtx) => HTMLElement> = {
  hanyang: hanyangBoard,
}
