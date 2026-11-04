// 한양 상단 판 고르기: 기본은 3D 테이블, 버튼으로 글자 판. WebGL이 안 되면 글자 판.
import { button, h } from '../../ui/dom.ts'
import type { BoardCtx } from '../registry.ts'
import { textBoard } from './board.ts'
import { HanyangTable } from './table3d.ts'

let table: HanyangTable | null = null
let mode: '3d' | 'text' = '3d'
let lastCtx: BoardCtx | null = null

export function hanyangBoard(ctx: BoardCtx): HTMLElement {
  lastCtx = ctx
  if (mode === '3d' && !table) {
    try {
      table = new HanyangTable(() => {
        mode = 'text'
        lastCtx?.redraw()
      })
      // 자동 확인(tools/e2e.ts)용
      ;(window as unknown as Record<string, unknown>).__aibgTable = table
    } catch {
      mode = 'text'
    }
  }
  if (mode === 'text' || !table) {
    return h(
      'div',
      {},
      table && button('3D 테이블로 보기', () => {
        mode = '3d'
        ctx.redraw()
      }, { class: 'small' }),
      textBoard(ctx),
    )
  }
  table.update(ctx)
  return table.root
}
