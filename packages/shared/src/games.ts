// 사이트에 있는 게임 목록. 새 게임은 여기에 더한다 (기획서 6장 8단계).
import type { GameRules } from './core/types.ts'
import { hanyang } from './hanyang/game.ts'

// 게임마다 상태·행동 타입이 달라서 목록에서는 넓은 타입으로 다룬다
export type AnyRules = GameRules<any, any, any>

export const GAMES: Record<string, AnyRules> = {
  [hanyang.id]: hanyang,
}
