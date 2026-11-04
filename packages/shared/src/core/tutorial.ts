// 튜토리얼 진행 (기획서 3.4장). 화면과 무관한 순수 코드: 연습 판, 단계, 직접 해 보기 확인, 안내 캐릭터 차례.
import { makeRng } from './rng.ts'
import { TUTORIAL_GUIDE, type GameRules, type PlayerId, type TutorialStep } from './types.ts'

const NOT_NOW = '설명을 읽고 "다음"을 눌러 주세요.'

export class TutorialRun<S, A extends { type: string }, V> {
  state: S
  step = 0
  /** 직접 해 보기를 마친 단계 */
  private tried = new Set<number>()
  /** 안내 캐릭터가 지금 하는 말 (해 보기 성공 뒤엔 after) */
  say: string

  private rules: GameRules<S, A, V>
  readonly me: PlayerId
  readonly target: number

  constructor(rules: GameRules<S, A, V>, me: PlayerId, target: number, seed = 7) {
    this.rules = rules
    this.me = me
    this.target = target
    const options = Object.fromEntries(rules.options.map((o) => [o.id, o.default]))
    if (rules.options.some((o) => o.id === 'target')) options.target = target
    this.state = rules.setup([me, TUTORIAL_GUIDE], seed, options)
    this.say = this.current.guide
    this.enter()
  }

  get steps(): TutorialStep[] {
    return this.rules.tutorial
  }

  get current(): TutorialStep {
    return this.steps[this.step]!
  }

  get text(): string {
    return this.current.text.replaceAll('{target}', String(this.target))
  }

  get last(): boolean {
    return this.step === this.steps.length - 1
  }

  /** 직접 해 보기 단계면 해 봐야 넘어간다 */
  get canNext(): boolean {
    return !this.current.waitFor || this.tried.has(this.step)
  }

  /** 지금 내가 할 수 있는 행동: 해 보기 중인 종류만 */
  legal(): A[] {
    const w = this.current.waitFor
    if (!w || this.tried.has(this.step)) return []
    return this.rules.legalActions(this.state, this.me).filter((a) => a.type === w)
  }

  view(): V {
    return this.rules.view(this.state, this.me)
  }

  next(): boolean {
    if (!this.canNext) return false
    if (this.last) return true
    this.step++
    this.enter()
    return false
  }

  prev(): void {
    if (this.step === 0) return
    this.step--
    this.say = this.current.guide
  }

  act(action: A): { ok: boolean; message: string } {
    const w = this.current.waitFor
    if (!w || this.tried.has(this.step)) return { ok: false, message: NOT_NOW }
    if (action.type !== w) return { ok: false, message: this.current.hint ?? NOT_NOW }
    this.state = this.rules.apply(this.state, this.me, action)
    this.tried.add(this.step)
    this.guideTurns()
    this.say = this.current.after ?? this.current.guide
    return { ok: true, message: this.say }
  }

  private enter() {
    const b = this.current.board
    if (b && this.rules.tutorialBoard) this.state = this.rules.tutorialBoard(b, this.state, this.me)
    this.say = this.current.guide
  }

  /** 내 차례가 돌아올 때까지 안내 캐릭터가 둔다 (봇) */
  private guideTurns() {
    const rng = makeRng(this.step + 1)
    for (let i = 0; i < 20 && this.rules.currentPlayer(this.state) === TUTORIAL_GUIDE; i++) {
      this.state = this.rules.apply(this.state, TUTORIAL_GUIDE, this.rules.bot(this.state, TUTORIAL_GUIDE, rng))
    }
  }
}
