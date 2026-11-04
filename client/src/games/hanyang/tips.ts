// 게임 중 팁 (기획서 4.8장): 튜토리얼을 본 사람에게만, 그 상황이 처음 생길 때 한 번씩
import { RULES, type HanyangAction, type HanyangView } from '@aibg/shared/hanyang'
import type { BoardCtx } from '../registry.ts'

export class Tips {
  private shown = new Set<string>()
  private key = ''
  private enabled = false

  /** 판마다 새로 센다. 튜토리얼을 건너뛰었으면 안 띄운다 */
  start(key: string, enabled: boolean) {
    if (key !== this.key) {
      this.key = key
      this.shown.clear()
    }
    this.enabled = enabled
  }

  check(ctx: BoardCtx, show: (text: string) => void) {
    const room = ctx.room
    const g = room.game as HanyangView | null
    if (!this.enabled || !g || room.phase !== 'playing' || room.tutorialPending.length) return
    const me = g.players.find((p) => p.id === ctx.me)
    if (!me) return
    const myTurn = room.current === ctx.me && room.legal.length > 0
    const legal = room.legal as HanyangAction[]
    const once = (id: string, text: string) => {
      if (this.shown.has(id)) return
      this.shown.add(id)
      show(text)
    }
    if (myTurn && g.phase === 'discard') once('discard', '물건은 10개까지예요. 넘는 만큼 되돌려 놓으세요')
    if (me.reserved.length >= RULES.maxReserved) once('reserve3', '외상 장부는 3장까지예요')
    if (g.endTriggered) once('end', '이번 바퀴를 마저 돌고 끝나요. 동점이면 카드가 적은 쪽이 이겨요')
    const rank = room.ranks[ctx.me]
    if (rank && rank !== '천민') once('rank', '점수가 오르면 신분도 올라요. 1등은 왕이 돼요')
    if (myTurn && g.phase === 'play' && legal.some((a) => a.type === 'reserve' && a.slot === 'deck')) {
      once('deck', '더미에서 안 보고 찜할 수도 있어요 (더미를 눌러 보세요)')
    }
  }

  /** 물건 하나를 골랐는데 같은 것 2개를 못 가져갈 때 */
  pickOne(left: number, show: (text: string) => void) {
    if (!this.enabled || left >= RULES.take2MinSupply || this.shown.has('take2')) return
    this.shown.add('take2')
    show(`같은 물건 2개는 ${RULES.take2MinSupply}개 이상 남았을 때만 가져올 수 있어요`)
  }
}
