// 사이트에 끼워 넣는 한양 상단 (기획서 2.2장 GameRules)
import type { GameRules } from '../core/types.ts'
import { chooseAction } from './bot.ts'
import { RULES } from './constants.ts'
import { TARGET_OPTION, activePlayer, apply, legalActions, pointsOf, result, setup, view } from './rules.ts'
import type { HanyangAction, HanyangState, HanyangView } from './types.ts'

export const hanyang: GameRules<HanyangState, HanyangAction, HanyangView> = {
  id: 'hanyang',
  name: '한양 상단',
  players: { min: RULES.minPlayers, max: RULES.maxPlayers },
  options: [TARGET_OPTION],
  tutorial: [],
  setup,
  currentPlayer: (s) => (s.phase === 'over' ? null : activePlayer(s).id),
  legalActions,
  apply,
  result,
  view,
  progress: (s, player) => {
    const p = s.players.find((x) => x.id === player)
    return p ? Math.min(1, pointsOf(p) / s.target) : 0
  },
  bot: (s, player, rng) => chooseAction(s, player, rng),
}
