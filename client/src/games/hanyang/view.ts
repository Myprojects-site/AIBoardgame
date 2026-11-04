// 한양 상단 판 고르기: 기본은 3D 테이블, 버튼으로 글자 판. WebGL이 안 되면 글자 판.
// 튜토리얼(기획서 3.4장): 방이 튜토리얼을 켰으면 주사위가 끝난 뒤 연습 판을 보여 주고, 다 보면 방에 알린다.
// 게임 중에도 "튜토리얼" 버튼으로 혼자 다시 볼 수 있다.
import type { HanyangView } from '@aibg/shared/hanyang'
import type { RoomView } from '@aibg/shared/room'
import { button, h } from '../../ui/dom.ts'
import type { BoardCtx } from '../registry.ts'
import { textBoard } from './board.ts'
import { HanyangTable } from './table3d.ts'
import { Tips } from './tips.ts'
import { TutorialMode, type TutorialMe } from './tutorialMode.ts'

const DICE_WAIT_MS = 4300 // 주사위 연출을 보고 나서 튜토리얼
const DEFAULT_TARGET = 21

let table: HanyangTable | null = null
let mode: '3d' | 'text' = '3d'
let lastCtx: BoardCtx | null = null
let tutorial: TutorialMode | null = null
let tutorialFor: 'room' | 'solo' | 'alone' | null = null
let onAloneExit: (() => void) | null = null
const finished = new Set<string>() // 이 판 튜토리얼을 마쳤다(또는 건너뜀)
const showAt = new Map<string, number>()
const tips = new Tips()

const gameKey = (room: RoomView) => `${room.code}:${JSON.stringify(room.dice)}`
const meOf = (ctx: BoardCtx): TutorialMe => ({ id: ctx.me, name: ctx.nameOf(ctx.me), color: ctx.colorOf(ctx.me) })

function ensureTable(): HanyangTable | null {
  if (mode === '3d' && !table) {
    try {
      table = new HanyangTable(
        () => {
          mode = 'text'
          lastCtx?.redraw()
        },
        () => openSolo(),
      )
      table.onPickOne = (_color, left) => tips.pickOne(left, (t) => table?.showTip(t))
      // 자동 확인(tools/e2e.ts)용
      ;(window as unknown as Record<string, unknown>).__aibgTable = table
    } catch {
      mode = 'text'
    }
  }
  return mode === '3d' ? table : null
}

function showTutorial() {
  if (!table || !tutorial) return
  table.update(tutorial.ctx())
  table.setGuide({ focus: tutorial.focus, panel: tutorial.panel })
}

function closeTutorial() {
  tutorial = null
  tutorialFor = null
  table?.setGuide(null)
}

function openSolo() {
  if (!lastCtx || tutorial) return
  const target = (lastCtx.room.game as HanyangView | null)?.target ?? DEFAULT_TARGET
  tutorial = new TutorialMode(meOf(lastCtx), target, () => {
    closeTutorial()
    lastCtx?.redraw()
  }, showTutorial)
  tutorialFor = 'solo'
  lastCtx.redraw()
}

function startRoomTutorial(ctx: BoardCtx, key: string) {
  const target = (ctx.room.game as HanyangView).target
  tutorial = new TutorialMode(meOf(ctx), target, (skipped) => {
    finished.add(key)
    tips.start(key, !skipped)
    closeTutorial()
    lastCtx?.tutorialDone()
    lastCtx?.redraw()
  }, showTutorial)
  tutorialFor = 'room'
}

export function hanyangBoard(ctx: BoardCtx): HTMLElement {
  lastCtx = ctx
  const t = ensureTable()
  const key = gameKey(ctx.room)
  const waitingForMe = ctx.room.phase === 'playing' && ctx.room.tutorialPending.includes(ctx.me) && !finished.has(key)

  if (!t) {
    // 글자 판에서는 튜토리얼 대신 바로 시작
    if (waitingForMe) {
      finished.add(key)
      ctx.tutorialDone()
    }
    return h('div', {}, table && button('3D 테이블로 보기', () => {
      mode = '3d'
      ctx.redraw()
    }, { class: 'small' }), textBoard(ctx))
  }

  if (!finished.has(key) && !waitingForMe) tips.start(key, false) // 튜토리얼을 안 본 판

  // 방 튜토리얼: 주사위를 본 뒤에 시작. 방장이 모두 건너뛰면 닫는다.
  if (waitingForMe && tutorialFor !== 'room') {
    if (!showAt.has(key)) showAt.set(key, performance.now() + (ctx.room.actions === 0 ? DICE_WAIT_MS : 0))
    const wait = showAt.get(key)! - performance.now()
    if (wait <= 0) {
      if (tutorial) closeTutorial()
      startRoomTutorial(ctx, key)
    } else setTimeout(() => lastCtx?.redraw(), wait + 50)
  } else if (tutorialFor === 'room' && !ctx.room.tutorialPending.includes(ctx.me)) {
    finished.add(key)
    closeTutorial()
  }

  if (tutorial && tutorialFor !== 'alone') {
    if (tutorialFor === 'solo') {
      const myTurn = ctx.room.current === ctx.me && ctx.room.legal.length > 0
      tutorial.setNotice(myTurn ? '실제 판에서 내 차례예요!' : null, () => {
        closeTutorial()
        ctx.redraw()
      })
    }
    showTutorial()
    return t.root
  }
  t.setGuide(null)
  t.update(ctx)
  tips.check(ctx, (text) => t.showTip(text))
  return t.root
}

/** 첫 화면에서 혼자 보는 튜토리얼 */
export function aloneTutorial(me: TutorialMe, onExit: () => void): HTMLElement {
  const t = ensureTable()
  if (!t) {
    onExit()
    return h('div', {})
  }
  onAloneExit = onExit
  tutorial = new TutorialMode(me, DEFAULT_TARGET, () => {
    closeTutorial()
    onAloneExit?.()
  }, showTutorial)
  tutorialFor = 'alone'
  showTutorial()
  return h('div', { class: 'alone-tutorial' }, h('h2', {}, '한양 상단 튜토리얼'), t.root)
}

/** 첫 화면으로 나가면 혼자 보던 튜토리얼은 닫는다 */
export function leaveAloneTutorial() {
  if (tutorialFor === 'alone') closeTutorial()
}
