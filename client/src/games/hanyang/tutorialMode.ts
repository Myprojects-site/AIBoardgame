// 튜토리얼 화면 (기획서 3.4, 4.8장): 연습 판을 3D 테이블에 올리고 안내 창을 띄운다.
// 진행 규칙은 공용 TutorialRun, 여기는 화면만.
import { TutorialRun } from '@aibg/shared/core/tutorial'
import { TUTORIAL_GUIDE } from '@aibg/shared/core/types'
import { hanyang, type HanyangAction, type HanyangState, type HanyangView } from '@aibg/shared/hanyang'
import { defaultSettings, type RoomView } from '@aibg/shared/room'
import { photoFor } from '../../photos.ts'
import { button, h } from '../../ui/dom.ts'
import type { BoardCtx } from '../registry.ts'

const GUIDE_NAME = '객주'
const GUIDE_COLOR = '#8a5a2b'
export const TUTORIAL_CODE = 'TUTOR' // 연습 판 표시 (실제 방 코드와 겹치지 않게 6자 미만)

export interface TutorialMe {
  id: string
  name: string
  color: string
}

export class TutorialMode {
  readonly run: TutorialRun<HanyangState, HanyangAction, HanyangView>
  readonly panel = h('div', { class: 'guide-panel', id: 'guide-panel' })
  private me: TutorialMe
  private message = ''
  private notice: HTMLElement | null = null
  private onFinish: (skipped: boolean) => void
  private refresh: () => void

  constructor(me: TutorialMe, target: number, onFinish: (skipped: boolean) => void, refresh: () => void) {
    this.me = me
    this.onFinish = onFinish
    this.refresh = refresh
    this.run = new TutorialRun(hanyang, me.id, target)
    this.draw()
  }

  /** 3D 테이블이 그릴 가짜 방: 나와 객주 둘 */
  ctx(): BoardCtx {
    const r = this.run
    const target = r.target
    const room: RoomView = {
      code: TUTORIAL_CODE,
      you: this.me.id,
      hostId: this.me.id,
      members: [
        { id: this.me.id, name: this.me.name, color: this.me.color, connected: true },
        { id: TUTORIAL_GUIDE, name: GUIDE_NAME, color: GUIDE_COLOR, connected: true },
      ],
      seats: [this.me.id, TUTORIAL_GUIDE],
      settings: { ...defaultSettings(), seats: 2, options: { target } },
      phase: 'playing',
      players: [this.me.id, TUTORIAL_GUIDE],
      game: r.view(),
      legal: r.legal(),
      current: hanyang.currentPlayer(r.state),
      ranks: {},
      result: null,
      chat: [],
      standIn: [],
      turnStartedAt: Date.now(),
      dice: [],
      tutorialPending: [],
      actions: 1,
      now: Date.now(),
    }
    const name = (id: string) => (id === TUTORIAL_GUIDE ? GUIDE_NAME : this.me.name)
    return {
      room,
      me: this.me.id,
      label: (id) => h('span', {}, name(id)),
      nameOf: name,
      colorOf: (id) => (id === TUTORIAL_GUIDE ? GUIDE_COLOR : this.me.color),
      act: (a) => this.act(a as HanyangAction),
      presence: () => {},
      react: () => {},
      redraw: this.refresh,
      isHost: false,
      tutorialDone: () => {},
      skipTutorial: () => {},
    }
  }

  get focus(): string[] {
    return this.run.current.focus
  }

  /** 혼자 다시 보는 중에 실제 판에서 내 차례가 오면 알린다 */
  setNotice(text: string | null, back?: () => void) {
    this.notice = text ? h('div', { class: 'notice' }, text, back ? button('판으로 돌아가기', back, { class: 'small primary' }) : '') : null
    this.draw()
  }

  private act(a: HanyangAction) {
    const res = this.run.act(a)
    this.message = res.ok ? '' : res.message
    this.draw()
    this.refresh()
  }

  private next() {
    this.message = ''
    if (this.run.next()) {
      this.onFinish(false)
      return
    }
    this.draw()
    this.refresh()
  }

  private draw() {
    const r = this.run
    const dots = r.steps.map((_, i) => (i < r.step ? '●' : i === r.step ? '◉' : '○')).join('')
    this.panel.replaceChildren(
      h('img', { class: 'photo big', src: photoFor(TUTORIAL_GUIDE, GUIDE_COLOR), alt: GUIDE_NAME }),
      h(
        'div',
        { class: 'col grow' },
        h('div', { class: 'row' }, h('b', {}, `${r.step + 1}. ${r.current.title}`), h('span', { class: 'dots' }, dots)),
        h('div', { class: 'guide-say' }, `${GUIDE_NAME}: “${r.say}”`),
        h('div', { class: 'guide-text' }, r.text),
        r.current.waitFor && !r.canNext ? h('div', { class: 'guide-try' }, '👉 직접 해 보세요') : '',
        this.message ? h('div', { class: 'guide-msg' }, this.message) : '',
        this.notice,
        h(
          'div',
          { class: 'row' },
          button('이전', () => {
            this.message = ''
            r.prev()
            this.draw()
            this.refresh()
          }, { class: 'small', disabled: r.step === 0 }),
          button(r.last ? '시작하기' : '다음', () => this.next(), { class: 'small primary', disabled: !r.canNext }),
          h('span', { class: 'spacer' }),
          button('건너뛰기', () => this.onFinish(true), { class: 'small' }),
        ),
      ),
    )
  }
}
