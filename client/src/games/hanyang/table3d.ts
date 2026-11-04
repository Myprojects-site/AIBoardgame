// 한양 상단 3D 테이블 (기획서 3장).
// 사랑방 낮은 상에 둘러앉는다. 나는 늘 앞자리, 카메라는 내 자리 뒤에서 상을 내려다본다.
// 같이 하는 느낌(3.3장): 다른 사람 손·보는 중, 토큰·카드가 날아가는 움직임, 반응·채팅 말풍선, 신분 연출, 소리.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RANKS, type Rank } from '@aibg/shared/core/rank'
import {
  COLORS,
  TIERS,
  TOKENS,
  TOKEN_NAMES,
  card,
  patron,
  type CardDef,
  type Color,
  type HanyangAction,
  type HanyangView,
  type PlayerView,
  type Tier,
  type Token,
} from '@aibg/shared/hanyang'
import { REACTIONS, isBot, type TablePoint } from '@aibg/shared/room'
import { onEphemeral, type Ephemeral } from '../../presence.ts'
import { sfx } from '../../sound.ts'
import { button, h, sameAction } from '../../ui/dom.ts'
import type { BoardCtx } from '../registry.ts'
import { statusLine, turnPrompt } from './board.ts'
import { COIN, avatarHeadY, dieRotation, makeAvatar, makeCoin, makeDie } from './models.ts'
import { CARD_H, CARD_W, cardBack, cardFace, cardImage, handTexture, labelTexture, patronFace } from './textures.ts'

// 배치 (월드 단위). 상 윗면 높이 top.
const L = {
  tableW: 18,
  tableD: 13.5,
  top: 0.8,
  cardT: 0.03,
  // 가운데: 명사 줄, 거래처 3줄(3단계가 멀리), 더미, 물건 더미
  patronZ: -3.1,
  patronX0: -2.8,
  patronStep: 1.3,
  patronSize: 1.1,
  rowZ: { 3: -1.4, 2: 0.2, 1: 1.8 } as Record<Tier, number>,
  deckX: -3.6,
  marketX: [-2.2, -0.9, 0.4, 1.7],
  supplyX: 3.6,
  supplyZ0: -2.6,
  supplyStep: 1.0,
  // 이 사각형 안은 모두에게 같은 자리 (손 위치를 그대로 주고받는다)
  centerX: 4.9,
  centerZ: 3.8,
  // 사람 자리: 타원 위, 자리 쪽이 로컬 +z
  areaRX: 6.6,
  areaRZ: 5.0,
  avatarRX: 10.2,
  avatarRZ: 8.4,
}

// 움직임·말풍선 (밀리초)
const FX = {
  flyMs: 520,
  coinStaggerMs: 70,
  arc: 1.1,
  bubbleMs: 2600,
  chatBubbleMs: 4200,
  bannerMs: 2600,
  presenceSendMs: 100,
  presenceStaleMs: 8000,
  hoverLift: 0.12,
  // 시작 주사위 (방장은 ROOM.diceIntroMs 동안 첫 봇 수를 기다린다)
  diceStaggerMs: 280,
  diceFlyMs: 1300,
  diceStayMs: 3600,
}

type Pick =
  | { kind: 'supply'; token: Color }
  | { kind: 'market'; tier: Tier; slot: number }
  | { kind: 'deck'; tier: Tier }
  | { kind: 'reserved'; index: number }
  | { kind: 'pile'; player: string; color: Color } // 산 카드 더미 → 눌러서 펼쳐 보기

const pickKey = (p: Pick) => JSON.stringify(p)

const geo = {
  card: new THREE.BoxGeometry(CARD_W, L.cardT, CARD_H),
  face: new THREE.PlaneGeometry(CARD_W * 0.98, CARD_H * 0.98).rotateX(-Math.PI / 2),
  patron: new THREE.BoxGeometry(L.patronSize, 0.05, L.patronSize),
  patronFace: new THREE.PlaneGeometry(L.patronSize * 0.97, L.patronSize * 0.97).rotateX(-Math.PI / 2),
  ring: new THREE.RingGeometry(0.85, 1.0, 32).rotateX(-Math.PI / 2),
}
const mat = {
  cardBody: new THREE.MeshStandardMaterial({ color: '#d8ccb4', roughness: 0.9 }),
  table: new THREE.MeshStandardMaterial({ color: '#8a6a48', roughness: 0.8 }),
  tableLeg: new THREE.MeshStandardMaterial({ color: '#6e5238', roughness: 0.8 }),
  floor: new THREE.MeshStandardMaterial({ color: '#d9c48f', roughness: 1 }),
  wall: new THREE.MeshStandardMaterial({ color: '#efe6d0', roughness: 1 }),
  turn: new THREE.MeshBasicMaterial({ color: '#ffd76a', transparent: true, opacity: 0.35, depthWrite: false }),
  slot: new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.12, depthWrite: false }),
}
const faceMats = new Map<THREE.Texture, THREE.MeshStandardMaterial>()
const faceMat = (t: THREE.Texture) => {
  let m = faceMats.get(t)
  if (!m) faceMats.set(t, (m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.85 })))
  return m
}

function cardMesh(tex: THREE.Texture, pick?: Pick): THREE.Group {
  const g = new THREE.Group()
  g.add(new THREE.Mesh(geo.card, mat.cardBody))
  const face = new THREE.Mesh(geo.face, faceMat(tex))
  face.position.y = L.cardT / 2 + 0.002
  g.add(face)
  if (pick) g.userData.pick = pick
  return g
}

function sprite(tex: THREE.Texture, width: number, aspect = 96 / 512): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }))
  s.scale.set(width, width * aspect, 1)
  s.renderOrder = 10
  return s
}

const label = (text: string, width: number, color?: string) => sprite(labelTexture(text, color), width)

function slotMark(w: number, d: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat.slot)
  m.position.y = 0.001
  return m
}

function bonusOf(p: PlayerView): Record<Color, CardDef[]> {
  const b = { cheong: [], jeok: [], hwang: [], baek: [], heuk: [] } as Record<Color, CardDef[]>
  for (const id of p.cards) b[card(id).color].push(card(id))
  return b
}

function pointsOf(p: PlayerView): number {
  return p.cards.reduce((s, id) => s + card(id).points, 0) + p.patrons.reduce((s, id) => s + patron(id).points, 0)
}

interface Tween {
  obj: THREE.Object3D
  from: THREE.Vector3
  to: THREE.Vector3
  qFrom?: THREE.Quaternion
  qTo?: THREE.Quaternion
  start: number
  dur: number
  done: () => void
  started?: () => void
}

interface DieAnim {
  die: THREE.Mesh
  tag: THREE.Sprite
  from: THREE.Vector3
  to: THREE.Vector3
  axis: THREE.Vector3
  qFinal: THREE.Quaternion
  start: number
  landed: boolean
}

interface Bubble {
  obj: THREE.Sprite
  anchor: () => THREE.Vector3 | null
  start: number
  life: number
}

interface Other {
  hand: THREE.Sprite
  target: THREE.Vector3 | null
  hover: string | null
  ring: THREE.Mesh
  tag: THREE.Sprite
  seen: number
}

/** 판이 바뀌기 전 모습: 날아갈 출발점을 알려고 */
interface Snapshot {
  cards: Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion }>
  coins: Map<string, THREE.Vector3[]>
  decks: Map<Tier, THREE.Vector3>
}

export class HanyangTable {
  readonly root: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
  private dyn = new THREE.Group() // 판이 바뀔 때마다 다시 만든다
  private fx = new THREE.Group() // 움직임·손·말풍선 (다시 만들지 않는다)
  private raycaster = new THREE.Raycaster()
  private tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -L.top)
  private ctx: BoardCtx | null = null
  private hud: HTMLElement
  private popup: HTMLElement
  private banner: HTMLElement
  private gallery: HTMLElement
  private mybar: HTMLElement
  private hoverKey: string | null = null
  private picked: Color[] = []
  private pickedTurn = ''
  private zoom = 1
  private topView = false
  private lastState = ''
  private built = false

  // 다시 만들 때마다 채우는 찾아보기 표
  private pickObjs = new Map<string, THREE.Object3D>()
  private cardObjs = new Map<string, THREE.Object3D>()
  private coinObjs = new Map<string, THREE.Mesh[]>() // `${주인}|${토큰}`, 주인은 supply 또는 사람 id
  private deckObjs = new Map<Tier, THREE.Object3D>()
  private areas = new Map<string, THREE.Group>()
  private anchors = new Map<string, THREE.Vector3>() // 말풍선 자리

  private tweens: Tween[] = []
  private bubbles: Bubble[] = []
  private others = new Map<string, Other>()
  private lastSent = { at: '', hover: '' as string | null, time: 0 }
  private presenceTimer: ReturnType<typeof setTimeout> | undefined
  private prevRanks: Record<string, Rank> = {}
  private prevCurrent: string | null = null
  private lastChatAt = 0
  // 자유 시점: 왼쪽 끌기 = 돌리기, 오른쪽 끌기 = 옮기기, 휠 = 확대
  private controls: OrbitControls
  private free = false
  private freeBtn: HTMLButtonElement
  private downAt = { x: 0, y: 0 }
  private dragged = false
  private diceKey = ''
  private dice: DieAnim[] = []
  private diceEnd = 0
  private diceBanner = ''

  constructor(onTextMode: () => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const canvas = this.renderer.domElement
    canvas.className = 'table-canvas'
    this.hud = h('div', { class: 'hud' })
    this.popup = h('div', { class: 'popup' })
    this.banner = h('div', { class: 'banner' })
    this.gallery = h('div', { class: 'gallery', id: 'gallery' })
    this.mybar = h('div', { class: 'mybar', id: 'mybar' })
    this.root = h(
      'div',
      { class: 'table3d' },
      canvas,
      this.hud,
      this.banner,
      this.mybar,
      this.popup,
      this.gallery,
      h('div', { class: 'reactbar' }, ...REACTIONS.map((e) => button(e, () => this.ctx?.react(e), { class: 'small react', title: '반응' }))),
      h('div', { class: 'viewbtns' },
        (this.freeBtn = button('자유 시점 (F)', () => this.setFree(!this.free), { class: 'small' }) as HTMLButtonElement),
        button('위에서 보기 (V)', () => this.toggleTop(), { class: 'small' }),
        button('글자 판', onTextMode, { class: 'small' })),
    )
    this.buildRoom()
    this.scene.add(this.dyn, this.fx)

    new ResizeObserver(() => this.resize()).observe(this.root)
    canvas.addEventListener('pointermove', (e) => this.onMove(e))
    canvas.addEventListener('pointerleave', () => {
      this.setHover(null)
      this.sendPresence(null, null, true)
    })
    canvas.addEventListener('click', (e) => this.onClick(e))
    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enabled = false
    this.controls.enableDamping = true
    this.controls.minDistance = 5
    this.controls.maxDistance = 38
    this.controls.maxPolarAngle = Math.PI * 0.4 // 너무 눕히면 카드가 서로 가려 누르기 어렵다
    // 끌어서 돌린 것은 누른 것으로 치지 않는다
    canvas.addEventListener('pointerdown', (e) => {
      this.downAt = { x: e.clientX, y: e.clientY }
      this.dragged = false
    })
    canvas.addEventListener('pointermove', (e) => {
      if (e.buttons && Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 6) this.dragged = true
    })
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())
    canvas.addEventListener('wheel', (e) => {
      if (this.free) return // 자유 시점은 OrbitControls가 확대한다
      e.preventDefault()
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.6, 1.4)
      this.placeCamera()
    }, { passive: false })
    window.addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if ((e.key === 'v' || e.key === 'V') && this.root.isConnected && !typing) this.toggleTop()
      if ((e.key === 'f' || e.key === 'F') && this.root.isConnected && !typing) this.setFree(!this.free)
      if (e.key === 'Escape') {
        this.closePopup()
        this.closeGallery()
      }
    })
    onEphemeral((m) => this.onEphemeral(m))
    this.renderer.setAnimationLoop((time) => {
      if (!this.root.isConnected) return
      this.tick(time)
      if (this.free) this.controls.update()
      this.renderer.render(this.scene, this.camera)
    })
  }

  update(ctx: BoardCtx): void {
    this.ctx = ctx
    const g = ctx.room.game as HanyangView
    const turnKey = `${g.round}:${g.current}:${g.phase}`
    if (turnKey !== this.pickedTurn) {
      this.picked = []
      this.pickedTurn = turnKey
      this.closePopup()
    }
    // 판이 그대로면 3D는 다시 만들지 않는다 (시간 표시 때문에 화면은 자주 다시 그린다)
    const state = JSON.stringify([g, ctx.room.legal, ctx.room.ranks, ctx.room.members, this.picked])
    if (state !== this.lastState) {
      this.lastState = state
      this.finishTweens()
      const before = this.built ? this.snapshot() : null
      this.rebuild(g)
      if (before) this.animateFrom(before)
      this.announce(ctx)
      this.built = true
    }
    this.drawHud(g)
    this.placeCamera()
    // 막 시작한 판이면 차례 주사위를 굴린다 (한 판에 한 번)
    const diceKey = JSON.stringify([ctx.room.dice, ctx.room.players])
    if (ctx.room.actions === 0 && ctx.room.dice.length && diceKey !== this.diceKey) {
      this.diceKey = diceKey
      this.rollDice(ctx)
    }
  }

  /** 자동 확인(e2e)용: 물건의 화면 좌표 */
  screenOf(p: Pick): { x: number; y: number } | null {
    const o = this.pickObjs.get(pickKey(p))
    if (!o) return null
    const v = new THREE.Vector3()
    o.getWorldPosition(v)
    v.project(this.camera)
    const r = this.renderer.domElement.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
  }

  /** 자동 확인(e2e)용: 다른 사람 손·보는 중 */
  othersDebug() {
    return {
      others: [...this.others.entries()].map(([id, o]) => ({ id, hand: !!o.target && o.hand.visible, hover: o.hover, ring: o.ring.visible })),
      bubbles: this.bubbles.length,
      flying: this.tweens.length,
      dice: this.dice.map((d) => d.landed),
    }
  }

  // ---- 방과 상 ----

  private buildRoom() {
    this.scene.background = new THREE.Color('#2a2420')
    this.scene.add(new THREE.HemisphereLight('#fff6e0', '#5a4632', 1.1))
    const sun = new THREE.DirectionalLight('#fff1d6', 1.6)
    sun.position.set(-8, 20, 10) // 창호지 쪽에서 들어오는 빛
    this.scene.add(sun)

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), mat.floor)
    this.scene.add(floor)
    // 네 벽 (자유 시점으로 돌아봐도 방 안)
    for (const [x, z, ry] of [[0, -22, 0], [0, 22, Math.PI], [-26, 0, Math.PI / 2], [26, 0, -Math.PI / 2]] as const) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(60, 14), mat.wall)
      wall.position.set(x, 7, z)
      wall.rotation.y = ry
      this.scene.add(wall)
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(L.tableW, 0.25, L.tableD), mat.table)
    top.position.y = L.top - 0.125
    this.scene.add(top)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, L.top - 0.25, 0.6), mat.tableLeg)
      leg.position.set(sx * (L.tableW / 2 - 0.8), (L.top - 0.25) / 2, sz * (L.tableD / 2 - 0.8))
      this.scene.add(leg)
    }
  }

  private resize() {
    const r = this.root.getBoundingClientRect()
    if (!r.width || !r.height) return
    this.renderer.setSize(r.width, r.height, false)
    this.camera.aspect = r.width / r.height
    this.camera.updateProjectionMatrix()
    this.placeCamera()
  }

  private toggleTop() {
    if (this.free) this.setFree(false)
    this.topView = !this.topView
    this.placeCamera()
  }

  private setFree(on: boolean) {
    this.free = on
    this.controls.enabled = on
    this.freeBtn.textContent = on ? '원래 시점으로 (F)' : '자유 시점 (F)'
    this.root.classList.toggle('free', on)
    if (on) {
      this.topView = false
      this.controls.target.set(0, L.top, 0.9)
      this.controls.update()
    } else {
      this.placeCamera()
    }
  }

  private placeCamera() {
    if (this.free) return
    const narrow = this.camera.aspect < 1.2 ? 1.25 : 1 // 세로로 긴 화면은 조금 멀리
    const d = this.zoom * narrow
    if (this.topView) {
      this.camera.position.set(0, 21 * d, 0.01)
      this.camera.lookAt(0, L.top, 0)
    } else {
      this.camera.position.set(0, 11.5 * d, 11.5 * d)
      this.camera.lookAt(0, L.top, 0.9)
    }
  }

  // ---- 판 ----

  private seatOrder(g: HanyangView): PlayerView[] {
    // 나를 맨 앞(0번)으로 돌려 세운다. 구경꾼이면 판 순서 그대로.
    const i = Math.max(0, g.players.findIndex((p) => p.id === this.ctx!.me))
    return [...g.players.slice(i), ...g.players.slice(0, i)]
  }

  private rebuild(g: HanyangView) {
    // 공유하지 않는 도형·재질은 버린다 (텍스처는 캐시가 들고 있다)
    const sharedGeo = new Set<THREE.BufferGeometry>(Object.values(geo))
    const sharedMat = new Set<THREE.Material>([...Object.values(mat), ...faceMats.values()])
    for (const o of [...this.dyn.children]) {
      this.dyn.remove(o)
      o.traverse((x) => {
        if (x instanceof THREE.Sprite) x.material.dispose()
        if (x instanceof THREE.Mesh && !x.userData.shared) {
          if (!sharedGeo.has(x.geometry)) x.geometry.dispose()
          if (!sharedMat.has(x.material)) (x.material as THREE.Material).dispose()
        }
      })
    }
    this.pickObjs.clear()
    this.cardObjs.clear()
    this.coinObjs.clear()
    this.deckObjs.clear()
    this.areas.clear()
    this.anchors.clear()
    const ctx = this.ctx!

    // 명사
    g.patrons.forEach((id, i) => {
      const t = new THREE.Group()
      t.add(new THREE.Mesh(geo.patron, mat.cardBody))
      const face = new THREE.Mesh(geo.patronFace, faceMat(patronFace(patron(id))))
      face.position.y = 0.026
      t.add(face)
      t.position.set(L.patronX0 + i * L.patronStep, L.top + 0.025, L.patronZ)
      this.dyn.add(t)
    })

    // 거래처
    for (const tier of TIERS) {
      const z = L.rowZ[tier]
      const n = g.decks[tier]
      if (n > 0) {
        const deck = new THREE.Group()
        const thick = Math.max(0.05, n * 0.012)
        const body = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, thick, CARD_H), mat.cardBody)
        body.position.y = thick / 2
        deck.add(body)
        const face = new THREE.Mesh(geo.face, faceMat(cardBack(tier)))
        face.position.y = thick + 0.002
        deck.add(face)
        const count = label(`${n}장`, 1.8)
        count.position.set(0, thick + 0.35, -0.2)
        deck.add(count)
        this.place(deck, L.deckX, z, { kind: 'deck', tier })
        this.deckObjs.set(tier, deck)
      } else {
        const m = slotMark(CARD_W, CARD_H)
        m.position.set(L.deckX, L.top + 0.001, z)
        this.dyn.add(m)
      }
      g.market[tier].forEach((id, slot) => {
        const x = L.marketX[slot]!
        if (!id) {
          const m = slotMark(CARD_W, CARD_H)
          m.position.set(x, L.top + 0.001, z)
          this.dyn.add(m)
          return
        }
        const m = cardMesh(cardFace(card(id)))
        this.place(m, x, z, { kind: 'market', tier, slot })
        this.cardObjs.set(id, m)
      })
    }

    // 물건 더미
    TOKENS.forEach((t, i) => {
      const stack = this.coinStack('supply', t, g.supply[t])
      const lifted = t !== 'yeop' && this.picked.includes(t as Color)
      this.place(stack, L.supplyX, L.supplyZ0 + i * L.supplyStep, t === 'yeop' ? undefined : { kind: 'supply', token: t }, lifted ? 0.3 : 0)
      const count = label(`${TOKEN_NAMES[t]} ${g.supply[t]}`, 2.2)
      count.position.set(L.supplyX + 1.35, L.top + 0.3, L.supplyZ0 + i * L.supplyStep)
      this.dyn.add(count)
    })

    // 사람 자리
    const order = this.seatOrder(g)
    order.forEach((p, i) => {
      const a = (i / order.length) * Math.PI * 2
      const area = this.playerArea(p, g, p.id === ctx.me)
      area.position.set(Math.sin(a) * L.areaRX, L.top, Math.cos(a) * L.areaRZ)
      area.rotation.y = a
      this.dyn.add(area)
      area.updateMatrixWorld(true)
      this.areas.set(p.id, area)
      if (p.id !== ctx.me) {
        const av = this.avatar(p, g)
        av.position.set(Math.sin(a) * L.avatarRX, 0, Math.cos(a) * L.avatarRZ)
        av.rotation.y = a + Math.PI
        this.dyn.add(av)
        this.anchors.set(p.id, av.position.clone().setY(avatarHeadY + 2.1))
      } else {
        this.anchors.set(p.id, area.position.clone().setY(L.top + 1.6))
      }
    })

    this.dyn.updateMatrixWorld(true)
    if (this.hoverKey) this.lift(this.hoverKey, true)
  }

  private place(o: THREE.Object3D, x: number, z: number, pick?: Pick, lift = 0) {
    o.position.set(x, L.top + L.cardT / 2 + lift, z)
    o.userData.baseY = o.position.y
    if (pick) {
      o.userData.pick = pick
      this.pickObjs.set(pickKey(pick), o)
    }
    this.dyn.add(o)
  }

  private coinStack(owner: string, t: Token, n: number): THREE.Group {
    const g = new THREE.Group()
    const coins: THREE.Mesh[] = []
    for (let k = 0; k < n; k++) {
      const c = makeCoin(t)
      c.position.y = COIN.h / 2 + k * COIN.h
      c.rotation.y = k * 0.7
      g.add(c)
      coins.push(c)
    }
    if (n === 0) g.add(slotMark(COIN.r * 2, COIN.r * 2))
    this.coinObjs.set(`${owner}|${t}`, coins)
    return g
  }

  private playerArea(p: PlayerView, g: HanyangView, mine: boolean): THREE.Group {
    const area = new THREE.Group()
    const current = g.current === g.players.indexOf(p) && g.phase !== 'over'
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 3.0).rotateX(-Math.PI / 2), current ? mat.turn : mat.slot)
    bg.position.y = 0.002
    area.add(bg)

    // 물건 (없는 색도 빈 더미를 두어 날아올 자리가 있게)
    TOKENS.forEach((t, i) => {
      const s = this.coinStack(p.id, t, p.tokens[t])
      s.position.set(-3.6 + i * 0.75, 0, 0.85)
      if (!p.tokens[t]) s.visible = false
      else {
        const n = label(String(p.tokens[t]), 1.0)
        n.position.set(0, 0.35 + p.tokens[t] * COIN.h, 0)
        s.add(n)
      }
      area.add(s)
    })
    // 산 카드: 색마다 한 더미
    const bonus = bonusOf(p)
    COLORS.forEach((c, i) => {
      const cards = bonus[c]
      if (!cards.length) return
      const pile = new THREE.Group()
      cards.forEach((def, k) => {
        const m = cardMesh(cardFace(def))
        m.position.set(0, k * L.cardT, -k * 0.12) // 겹쳐 놓아 몇 장인지 보이게
        pile.add(m)
        this.cardObjs.set(def.id, m)
      })
      pile.position.set(-3.6 + i * 1.1, L.cardT / 2, -0.45)
      const pick: Pick = { kind: 'pile', player: p.id, color: c }
      pile.userData.pick = pick
      pile.userData.baseY = pile.position.y
      this.pickObjs.set(pickKey(pick), pile)
      const n = label(`${cards.length}장`, 1.5)
      n.position.set(0, 0.45 + cards.length * L.cardT, -0.25 - cards.length * 0.12)
      pile.add(n)
      area.add(pile)
    })
    // 찜한 카드
    p.reserved.forEach((r, index) => {
      const def = r.card ? card(r.card) : null
      const tex = def && (mine || !r.blind) ? cardFace(def) : cardBack(def?.tier ?? 1)
      const pick: Pick | undefined = mine ? { kind: 'reserved', index } : undefined
      const m = cardMesh(tex, pick)
      m.position.set(1.7 + index * 1.1, L.cardT / 2, 0.15)
      m.userData.baseY = m.position.y
      if (pick) this.pickObjs.set(pickKey(pick), m)
      if (def) this.cardObjs.set(def.id, m)
      area.add(m)
    })
    // 데려온 명사
    p.patrons.forEach((id, i) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2), faceMat(patronFace(patron(id))))
      t.position.set(1.7 + i * 0.7, 0.01, -1.05)
      area.add(t)
    })
    // 점수 (내 자리는 아바타가 없으니 여기 이름도)
    const rank = this.ctx!.room.ranks[p.id]
    const text = mine ? `나${rank ? ` [${rank}]` : ''} · ${pointsOf(p)}점` : `${pointsOf(p)}점`
    const score = label(text, mine ? 3.0 : 2.4, mine ? '#8e2b1f' : undefined)
    score.position.set(3.4, 0.6, -1.0)
    area.add(score)
    return area
  }

  private avatar(p: PlayerView, g: HanyangView): THREE.Group {
    const ctx = this.ctx!
    const color = ctx.colorOf(p.id)
    const rank = ctx.room.ranks[p.id] ?? '천민'
    const av = makeAvatar(rank, color)
    const away = !isBot(p.id) && !ctx.room.members.find((m) => m.id === p.id)?.connected
    const tag = label(`[${rank}] ${ctx.nameOf(p.id)}${away ? ' (자리 비움)' : ''}`, 4.4, color)
    tag.position.y = avatarHeadY + 1.3
    av.add(tag)
    if (g.current === g.players.indexOf(p) && g.phase !== 'over') {
      // 차례 등잔불
      const lamp = new THREE.PointLight('#ffcc66', 6, 6)
      lamp.position.set(0, 3.2, 0)
      av.add(lamp)
      const glow = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.7, 32).rotateX(-Math.PI / 2), mat.turn)
      glow.position.y = 0.02
      av.add(glow)
    }
    return av
  }

  // ---- 움직임 ----

  private snapshot(): Snapshot {
    const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3())
    const cards = new Map<string, { pos: THREE.Vector3; quat: THREE.Quaternion }>()
    for (const [id, o] of this.cardObjs) cards.set(id, { pos: world(o), quat: o.getWorldQuaternion(new THREE.Quaternion()) })
    const coins = new Map<string, THREE.Vector3[]>()
    for (const [k, list] of this.coinObjs) coins.set(k, list.map(world))
    const decks = new Map<Tier, THREE.Vector3>()
    for (const [t, o] of this.deckObjs) decks.set(t, world(o))
    return { cards, coins, decks }
  }

  /** 바뀐 것만 날려 보낸다: 같은 카드가 자리를 옮겼거나, 같은 색 토큰이 한쪽에서 줄고 다른 쪽에서 늘었을 때 */
  private animateFrom(before: Snapshot) {
    const now = performance.now()
    let cardsMoved = 0
    for (const [id, obj] of this.cardObjs) {
      const was = before.cards.get(id)
      const tier = card(id).tier
      const from = was?.pos ?? before.decks.get(tier) // 새로 펼친 카드는 더미에서
      const to = obj.getWorldPosition(new THREE.Vector3())
      if (!from || from.distanceTo(to) < 0.05) continue
      const qTo = obj.getWorldQuaternion(new THREE.Quaternion())
      this.fly(obj, from, to, was?.quat ?? qTo, qTo, now + cardsMoved * 60)
      cardsMoved++
    }
    if (cardsMoved) sfx.card()

    let coinIndex = 0
    for (const t of TOKENS) {
      const owners = new Set<string>()
      for (const k of [...before.coins.keys(), ...this.coinObjs.keys()]) if (k.endsWith(`|${t}`)) owners.add(k.split('|')[0]!)
      const sources: THREE.Vector3[] = []
      const sinks: THREE.Mesh[] = []
      for (const o of owners) {
        const old = before.coins.get(`${o}|${t}`) ?? []
        const now2 = this.coinObjs.get(`${o}|${t}`) ?? []
        const d = now2.length - old.length
        if (d < 0) sources.push(...old.slice(old.length + d).reverse())
        if (d > 0) sinks.push(...now2.slice(now2.length - d))
      }
      sinks.forEach((dest, i) => {
        const from = sources[i]
        if (!from) return
        dest.visible = false
        dest.parent!.visible = true
        const temp = makeCoin(t)
        this.fx.add(temp)
        const to = dest.getWorldPosition(new THREE.Vector3())
        const start = now + coinIndex++ * FX.coinStaggerMs
        this.tweens.push({
          obj: temp,
          from,
          to,
          start,
          dur: FX.flyMs,
          started: () => sfx.coin(),
          done: () => {
            this.fx.remove(temp)
            dest.visible = true
          },
        })
        temp.position.copy(from)
      })
    }
  }

  private fly(obj: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, qFrom: THREE.Quaternion, qTo: THREE.Quaternion, start: number) {
    const parent = obj.parent!
    this.fx.attach(obj)
    obj.position.copy(from)
    obj.quaternion.copy(qFrom)
    this.tweens.push({ obj, from, to, qFrom, qTo, start, dur: FX.flyMs, done: () => parent.attach(obj) })
  }

  private finishTweens() {
    for (const t of this.tweens) {
      t.obj.position.copy(t.to)
      if (t.qTo) t.obj.quaternion.copy(t.qTo)
      t.done()
    }
    this.tweens = []
  }

  private tick(time: number) {
    const now = performance.now()
    this.tickDice(now)
    // 날아가는 것들: 포물선
    this.tweens = this.tweens.filter((t) => {
      if (now < t.start) return true
      if (t.started) {
        t.started()
        t.started = undefined
      }
      const k = Math.min(1, (now - t.start) / t.dur)
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
      t.obj.position.lerpVectors(t.from, t.to, e)
      t.obj.position.y += Math.sin(Math.PI * k) * FX.arc
      if (t.qFrom && t.qTo) t.obj.quaternion.slerpQuaternions(t.qFrom, t.qTo, e)
      if (k >= 1) {
        t.done()
        return false
      }
      return true
    })
    // 말풍선
    this.bubbles = this.bubbles.filter((b) => {
      const k = (now - b.start) / b.life
      const at = b.anchor()
      if (k >= 1 || !at) {
        this.fx.remove(b.obj)
        b.obj.material.dispose()
        return false
      }
      b.obj.position.copy(at).add(new THREE.Vector3(0, k * 0.8, 0))
      b.obj.material.opacity = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      return true
    })
    // 다른 사람 손: 부드럽게 따라가고, 오래 소식이 없으면 숨긴다
    for (const o of this.others.values()) {
      const fresh = now - o.seen < FX.presenceStaleMs
      o.hand.visible = !!o.target && fresh
      if (o.target && fresh) o.hand.position.lerp(o.target, 0.25)
      const hovered = fresh && o.hover ? this.pickObjs.get(o.hover) : undefined
      o.ring.visible = o.tag.visible = !!hovered
      if (hovered) {
        const p = hovered.getWorldPosition(new THREE.Vector3())
        o.ring.position.set(p.x, L.top + 0.01, p.z)
        o.tag.position.set(p.x, L.top + 1.3, p.z - 0.2)
      }
    }
    void time
  }

  private rollDice(ctx: BoardCtx) {
    this.clearDice()
    const now = performance.now()
    const order = ctx.room.players
    ctx.room.dice.forEach((d, i) => {
      const area = this.areas.get(d.player)
      if (!area) return
      const value = d.rolls[d.rolls.length - 1]!
      const die = makeDie()
      // 그 사람 자리에서 던져 상 가운데 쪽에 떨어진다
      const from = area.position.clone().multiplyScalar(1.15).setY(L.top + 3.2)
      const to = area.position.clone().multiplyScalar(0.55).setY(L.top + 0.35)
      const place = order.indexOf(d.player) + 1
      const tag = label(`${d.rolls.join('→')} · ${place}번째`, 2.8, ctx.colorOf(d.player))
      tag.visible = false
      this.fx.add(die, tag)
      die.position.copy(from)
      this.dice.push({
        die,
        tag,
        from,
        to,
        axis: new THREE.Vector3(Math.random() - 0.5, 1, Math.random() - 0.5).normalize(),
        qFinal: dieRotation(value, Math.random() * Math.PI * 2),
        start: now + i * FX.diceStaggerMs,
        landed: false,
      })
    })
    const name = (p: string) => (p === ctx.me ? '나' : ctx.nameOf(p))
    this.diceBanner = `🎲 차례: ${order.map(name).join(' → ')}`
    this.diceEnd = now + (ctx.room.dice.length - 1) * FX.diceStaggerMs + FX.diceFlyMs
  }

  private clearDice() {
    for (const d of this.dice) this.fx.remove(d.die, d.tag)
    for (const d of this.dice) d.tag.material.dispose()
    this.dice = []
    this.diceBanner = ''
  }

  private tickDice(now: number) {
    if (!this.dice.length) return
    for (const d of this.dice) {
      if (now < d.start) continue
      const k = Math.min(1, (now - d.start) / FX.diceFlyMs)
      const e = 1 - (1 - k) ** 3
      d.die.position.lerpVectors(d.from, d.to, e)
      d.die.position.y += Math.abs(Math.sin(Math.PI * 2.2 * k)) * (1 - k) * 1.4 // 통통 튀며
      d.die.quaternion.setFromAxisAngle(d.axis, (1 - e) * Math.PI * 6).multiply(d.qFinal)
      if (k >= 1 && !d.landed) {
        d.landed = true
        d.tag.visible = true
        d.tag.position.copy(d.to).setY(L.top + 1.2)
        sfx.dice()
      }
    }
    if (this.diceBanner && now >= this.diceEnd) {
      this.showBanner(this.diceBanner)
      this.diceBanner = ''
    }
    if (now >= this.diceEnd + FX.diceStayMs) this.clearDice()
  }

  private bubble(player: string, text: string, life: number, width = 2.2) {
    const s = label(text, width)
    s.material = s.material.clone() // 따로 흐려지게
    this.fx.add(s)
    this.bubbles.push({ obj: s, anchor: () => this.anchors.get(player)?.clone() ?? null, start: performance.now(), life })
  }

  private showBanner(text: string) {
    this.banner.textContent = text
    this.banner.classList.add('on')
    setTimeout(() => this.banner.classList.remove('on'), FX.bannerMs)
  }

  /** 판이 바뀐 뒤 알릴 것: 내 차례, 신분 오름, 새 채팅 */
  private announce(ctx: BoardCtx) {
    const room = ctx.room
    if (this.built) {
      if (room.current === ctx.me && this.prevCurrent !== ctx.me) sfx.turn()
      // 한꺼번에 여럿 오를 수 있다(끝나는 순간 등) → 알림 띠는 가장 높은 신분 하나만
      let top: { p: string; rank: Rank } | null = null
      for (const [p, rank] of Object.entries(room.ranks)) {
        const before = this.prevRanks[p]
        if (!before || RANKS.indexOf(rank) <= RANKS.indexOf(before)) continue
        this.bubble(p, `✨ ${rank} ✨`, FX.bubbleMs, 2.4)
        if (!top || RANKS.indexOf(rank) > RANKS.indexOf(top.rank)) top = { p, rank }
      }
      if (top) {
        const who = top.p === ctx.me ? '내가' : `${ctx.nameOf(top.p)}님이`
        this.showBanner(top.rank === '왕' ? `👑 ${who} 왕이 되었다!` : `${who} ${top.rank}이 되었다!`)
        if (top.rank === '왕') sfx.king()
        else sfx.rankUp()
      }
      for (const line of room.chat) {
        if (line.at <= this.lastChatAt || !line.from) continue
        this.bubble(line.from, line.text.length > 18 ? `${line.text.slice(0, 18)}…` : line.text, FX.chatBubbleMs, 3.2)
      }
    }
    this.prevCurrent = room.current
    this.prevRanks = { ...room.ranks }
    this.lastChatAt = room.chat.reduce((m, c) => Math.max(m, c.at), this.lastChatAt)
  }

  // ---- 다른 사람 손·보는 중·반응 ----

  private other(id: string): Other {
    let o = this.others.get(id)
    if (!o) {
      const color = this.ctx?.colorOf(id) ?? '#888'
      const hand = sprite(handTexture(color), 0.9, 1)
      hand.visible = false
      const ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }))
      ring.visible = false
      const tag = label(`${this.ctx?.nameOf(id) ?? ''} 보는 중`, 2.4, color)
      tag.visible = false
      this.fx.add(hand, ring, tag)
      o = { hand, ring, tag, target: null, hover: null, seen: 0 }
      this.others.set(id, o)
    }
    return o
  }

  private onEphemeral(m: Ephemeral) {
    if (!this.ctx || !this.root.isConnected) return
    if (m.t === 'react') {
      this.bubble(m.from, m.emoji, FX.bubbleMs, m.emoji.length > 2 ? 2.2 : 1.4)
      sfx.pop()
      return
    }
    if (m.from === this.ctx.me) return
    const o = this.other(m.from)
    o.seen = performance.now()
    o.hover = m.hover
    o.target = m.at ? this.fromTablePoint(m.at) : null
    if (o.target && !o.hand.visible) o.hand.position.copy(o.target)
  }

  /** 상 위의 점 → 모두가 알아듣는 좌표 (가운데는 그대로, 사람 자리 위는 그 자리 기준) */
  private toTablePoint(p: THREE.Vector3): TablePoint {
    if (Math.abs(p.x) <= L.centerX && Math.abs(p.z) <= L.centerZ) return { c: [round(p.x), round(p.z)] }
    let best: [string, THREE.Group] | null = null
    let dist = Infinity
    for (const entry of this.areas) {
      const d = entry[1].position.distanceTo(p)
      if (d < dist) {
        dist = d
        best = entry
      }
    }
    if (!best) return { c: [round(p.x), round(p.z)] }
    const l = best[1].worldToLocal(p.clone())
    return { p: best[0], l: [round(l.x), round(l.z)] }
  }

  private fromTablePoint(t: TablePoint): THREE.Vector3 | null {
    if ('c' in t) return new THREE.Vector3(t.c[0], L.top + 0.45, t.c[1])
    const area = this.areas.get(t.p)
    return area ? area.localToWorld(new THREE.Vector3(t.l[0], 0, t.l[1])).setY(L.top + 0.45) : null
  }

  private sendPresence(at: TablePoint | null, hover: string | null, force = false) {
    if (!this.ctx) return
    clearTimeout(this.presenceTimer)
    const key = JSON.stringify(at)
    const now = performance.now()
    if (!force && key === this.lastSent.at && hover === this.lastSent.hover) return
    const wait = FX.presenceSendMs - (now - this.lastSent.time)
    if (!force && wait > 0) {
      // 너무 잦으면 미루되, 마우스가 멈춘 마지막 자리는 꼭 보낸다
      this.presenceTimer = setTimeout(() => this.sendPresence(at, hover, true), wait)
      return
    }
    this.lastSent = { at: key, hover, time: now }
    this.ctx.presence(at, hover)
  }

  // ---- 고르기 ----

  private legal(): HanyangAction[] {
    return (this.ctx?.room.legal ?? []) as HanyangAction[]
  }

  private can(a: HanyangAction) {
    return this.legal().some((l) => sameAction(l, a))
  }

  private canPick(): boolean {
    const g = this.ctx?.room.game as HanyangView | undefined
    return !!g && g.phase === 'play' && this.legal().some((a) => a.type === 'take3' || a.type === 'take2')
  }

  private ray(e: MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(v, this.camera)
  }

  private hit(): { obj: THREE.Object3D; pick: Pick } | null {
    for (const x of this.raycaster.intersectObjects(this.dyn.children, true)) {
      let o: THREE.Object3D | null = x.object
      while (o && !o.userData.pick) o = o.parent
      if (o) return { obj: o, pick: o.userData.pick as Pick }
    }
    return null
  }

  private actionsFor(p: Pick): { label: string; action: HanyangAction }[] {
    switch (p.kind) {
      case 'market':
        return [
          { label: '사기', action: { type: 'buy', tier: p.tier, slot: p.slot } },
          { label: '찜하기', action: { type: 'reserve', tier: p.tier, slot: p.slot } },
        ]
      case 'deck':
        return [{ label: '안 보고 찜하기', action: { type: 'reserve', tier: p.tier, slot: 'deck' } }]
      case 'reserved':
        return [{ label: '사기', action: { type: 'buyReserved', index: p.index } }]
      case 'supply':
      case 'pile':
        return []
    }
  }

  private usable(p: Pick): boolean {
    if (p.kind === 'pile') return true
    if (p.kind === 'supply') return this.canPick() && (this.ctx!.room.game as HanyangView).supply[p.token] > 0
    return this.actionsFor(p).some((a) => this.can(a.action))
  }

  private lift(key: string, up: boolean) {
    const o = this.pickObjs.get(key)
    if (o && typeof o.userData.baseY === 'number') o.position.y = o.userData.baseY + (up ? FX.hoverLift : 0)
  }

  private setHover(key: string | null) {
    if (key === this.hoverKey) return
    if (this.hoverKey) this.lift(this.hoverKey, false)
    this.hoverKey = key
    if (key) this.lift(key, true)
  }

  private onMove(e: PointerEvent) {
    this.ray(e)
    const hit = this.hit()
    const ok = hit && (this.usable(hit.pick) || hit.pick.kind === 'market' || hit.pick.kind === 'reserved')
    this.renderer.domElement.style.cursor = ok ? 'pointer' : ''
    this.setHover(ok ? pickKey(hit.pick) : null)
    // 다른 사람에게: 손 위치와 내가 보는 것 (내 찜 카드는 나만 아는 자리라 안 보낸다)
    const p = this.raycaster.ray.intersectPlane(this.tablePlane, new THREE.Vector3())
    const shared = hit && hit.pick.kind !== 'reserved' ? pickKey(hit.pick) : null
    this.sendPresence(p ? this.toTablePoint(p) : null, shared)
  }

  private onClick(e: MouseEvent) {
    if (this.dragged) return
    this.ray(e)
    const hit = this.hit()
    if (!hit) {
      this.closeGallery()
      return this.closePopup()
    }
    const p = hit.pick
    if (p.kind === 'pile') {
      this.closePopup()
      this.openGallery(p.player, p.color)
      return
    }
    if (p.kind === 'supply') {
      this.closePopup()
      if (!this.usable(p)) return
      this.picked = this.picked.includes(p.token) ? this.picked.filter((c) => c !== p.token) : [...this.picked, p.token]
      sfx.coin()
      this.update(this.ctx!)
      return
    }
    this.openPopup(p, e)
  }

  private openPopup(p: Pick, e: MouseEvent) {
    const g = this.ctx!.room.game as HanyangView
    let def: CardDef | null = null
    if (p.kind === 'market') def = card(g.market[p.tier][p.slot]!)
    if (p.kind === 'reserved') {
      const id = g.players.find((x) => x.id === this.ctx!.me)?.reserved[p.index]?.card
      def = id ? card(id) : null
    }
    const r = this.root.getBoundingClientRect()
    this.popup.replaceChildren(
      def
        ? h('div', {}, h('b', {}, def.name), ` ${def.points}점 · ${TOKEN_NAMES[def.color]} 할인`,
            h('div', { class: 'small' }, '비용 ', COLORS.filter((c) => def!.cost[c]).map((c) => `${TOKEN_NAMES[c]} ${def!.cost[c]}`).join(', ')))
        : h('b', {}, p.kind === 'deck' ? '더미 맨 위 카드' : ''),
      h('div', { class: 'row' }, ...this.actionsFor(p).map((a) =>
        button(a.label, () => {
          this.closePopup()
          this.ctx!.act(a.action)
        }, { class: 'small primary', disabled: !this.can(a.action) }))),
    )
    this.popup.style.left = `${Math.min(e.clientX - r.left + 12, r.width - 220)}px`
    this.popup.style.top = `${Math.min(e.clientY - r.top + 12, r.height - 110)}px`
    this.popup.classList.add('on')
  }

  private closePopup() {
    this.popup.classList.remove('on')
  }

  /** 산 카드 더미를 펼쳐 본다: 그 색 카드 전부와 할인 수 */
  private openGallery(player: string, color: Color) {
    const g = this.ctx!.room.game as HanyangView
    const p = g.players.find((x) => x.id === player)
    if (!p) return
    const cards = bonusOf(p)[color]
    const who = player === this.ctx!.me ? '내' : `${this.ctx!.nameOf(player)}님의`
    const points = cards.reduce((s, c) => s + c.points, 0)
    this.gallery.replaceChildren(
      h('div', { class: 'gallery-head' },
        h('b', {}, `${who} ${TOKEN_NAMES[color]} 카드 ${cards.length}장`),
        h('span', { class: `tok tok-${color}` }, `${TOKEN_NAMES[color]} 할인 +${cards.length}`),
        points ? h('span', {}, ` · 점수 ${points}점`) : '',
        h('span', { class: 'spacer' }),
        button('닫기', () => this.closeGallery(), { class: 'small' })),
      h('div', { class: 'gallery-cards' }, ...cards.map((c) => h('img', { src: cardImage(c), alt: c.name, title: c.name }))),
    )
    this.gallery.classList.add('on')
  }

  private closeGallery() {
    this.gallery.classList.remove('on')
  }

  private drawMyBar(g: HanyangView) {
    const me = g.players.find((p) => p.id === this.ctx!.me)
    if (!me) {
      this.mybar.replaceChildren()
      return
    }
    const bonus = bonusOf(me)
    const total = TOKENS.reduce((s, t) => s + me.tokens[t], 0)
    this.mybar.replaceChildren(
      h('b', {}, '내 살림'),
      ...COLORS.map((c) =>
        h('span', { class: `mine tok-${c}`, title: `${TOKEN_NAMES[c]}: 물건 ${me.tokens[c]}개 + 할인 ${bonus[c].length} = ${me.tokens[c] + bonus[c].length}` },
          h('b', {}, TOKEN_NAMES[c]), ` ${me.tokens[c]}`, h('small', {}, `+${bonus[c].length}`))),
      h('span', { class: 'mine tok-yeop', title: '엽전: 어떤 물건으로도 낼 수 있다' }, h('b', {}, '엽전'), ` ${me.tokens.yeop}`),
      h('span', { class: 'muted' }, `물건 ${total}/10 · 앞 숫자 = 물건, +숫자 = 할인`),
    )
  }

  private drawHud(g: HanyangView) {
    const ctx = this.ctx!
    this.drawMyBar(g)
    const take3 = { type: 'take3', colors: COLORS.filter((c) => this.picked.includes(c)) } as HanyangAction
    const take2 = this.picked.length === 1 ? ({ type: 'take2', color: this.picked[0]! } as HanyangAction) : null
    const picking = this.canPick()
    this.hud.replaceChildren(
      statusLine(ctx),
      turnPrompt(ctx) ?? '',
      picking
        ? h('div', { class: 'pickbar' },
            this.picked.length
              ? h('span', {}, '고른 물건: ', ...this.picked.map((c) => h('span', { class: `tok tok-${c}` }, TOKEN_NAMES[c])))
              : h('span', { class: 'muted' }, '상 오른쪽 물건 더미를 눌러 고르세요 · 카드를 누르면 사기·찜하기'),
            button('가져오기', () => ctx.act(take3), { class: 'small primary', disabled: !this.can(take3) }),
            take2 && button(`${TOKEN_NAMES[this.picked[0]!]} 2개 가져오기`, () => ctx.act(take2), { class: 'small', disabled: !this.can(take2) }),
            this.picked.length > 0 && button('다시 고르기', () => {
              this.picked = []
              this.update(ctx)
            }, { class: 'small' }))
        : '',
    )
  }
}

const round = (n: number) => Math.round(n * 100) / 100
