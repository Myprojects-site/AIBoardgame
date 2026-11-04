// 한양 상단 3D 테이블 (기획서 3장, 6장 3단계: 회색 상자).
// 사랑방 낮은 상에 둘러앉는다. 나는 늘 앞자리, 카메라는 내 자리 뒤에서 상을 내려다본다.
import * as THREE from 'three'
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
import { button, h, sameAction } from '../../ui/dom.ts'
import type { BoardCtx } from '../registry.ts'
import { statusLine, turnPrompt } from './board.ts'
import { CARD_H, CARD_W, TOKEN_COLORS, cardBack, cardFace, labelTexture, patronFace } from './textures.ts'

// 배치 (월드 단위). 상 윗면 높이 TOP.
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
  coinR: 0.32,
  coinH: 0.07,
  // 사람 자리: 타원 위, 자리 쪽이 로컬 +z
  areaRX: 6.6,
  areaRZ: 5.0,
  avatarRX: 10.2,
  avatarRZ: 8.4,
}

type Pick =
  | { kind: 'supply'; token: Color }
  | { kind: 'market'; tier: Tier; slot: number }
  | { kind: 'deck'; tier: Tier }
  | { kind: 'reserved'; index: number }

const pickKey = (p: Pick) => JSON.stringify(p)

const geo = {
  card: new THREE.BoxGeometry(CARD_W, L.cardT, CARD_H),
  face: new THREE.PlaneGeometry(CARD_W * 0.98, CARD_H * 0.98).rotateX(-Math.PI / 2),
  coin: new THREE.CylinderGeometry(L.coinR, L.coinR, L.coinH, 24),
  patron: new THREE.BoxGeometry(L.patronSize, 0.05, L.patronSize),
  patronFace: new THREE.PlaneGeometry(L.patronSize * 0.97, L.patronSize * 0.97).rotateX(-Math.PI / 2),
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
const coinMats = new Map<Token, THREE.MeshStandardMaterial>()
const coinMat = (t: Token) => {
  let m = coinMats.get(t)
  if (!m) coinMats.set(t, (m = new THREE.MeshStandardMaterial({ color: TOKEN_COLORS[t], roughness: 0.5, metalness: t === 'yeop' ? 0.5 : 0.05 })))
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

function label(text: string, width: number, color?: string): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, color), depthTest: false, transparent: true }))
  s.scale.set(width, width * (96 / 512), 1)
  s.renderOrder = 10
  return s
}

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

export class HanyangTable {
  readonly root: HTMLElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200)
  private dyn = new THREE.Group()
  private raycaster = new THREE.Raycaster()
  private ctx: BoardCtx | null = null
  private hud: HTMLElement
  private popup: HTMLElement
  private hoverKey: string | null = null
  private picked: Color[] = []
  private pickedTurn = ''
  private zoom = 1
  private topView = false
  private lastState = ''

  constructor(onTextMode: () => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    const canvas = this.renderer.domElement
    canvas.className = 'table-canvas'
    this.hud = h('div', { class: 'hud' })
    this.popup = h('div', { class: 'popup' })
    this.root = h(
      'div',
      { class: 'table3d' },
      canvas,
      this.hud,
      this.popup,
      h('div', { class: 'viewbtns' },
        button('위에서 보기 (V)', () => this.toggleTop(), { class: 'small' }),
        button('글자 판', onTextMode, { class: 'small' })),
    )
    this.buildRoom()
    this.scene.add(this.dyn)

    new ResizeObserver(() => this.resize()).observe(this.root)
    canvas.addEventListener('pointermove', (e) => this.onMove(e))
    canvas.addEventListener('pointerleave', () => this.setHover(null))
    canvas.addEventListener('click', (e) => this.onClick(e))
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault()
      this.zoom = THREE.MathUtils.clamp(this.zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.6, 1.4)
      this.placeCamera()
    }, { passive: false })
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'v' || e.key === 'V') && this.root.isConnected && !(e.target instanceof HTMLInputElement)) this.toggleTop()
      if (e.key === 'Escape') this.closePopup()
    })
    this.renderer.setAnimationLoop(() => {
      if (this.root.isConnected) this.renderer.render(this.scene, this.camera)
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
    const state = JSON.stringify([g, ctx.room.legal, ctx.room.ranks, ctx.room.members, this.picked, this.hoverKey])
    if (state !== this.lastState) {
      this.lastState = state
      this.rebuild(g)
    }
    this.drawHud(g)
    this.placeCamera()
  }

  /** 자동 확인(e2e)용: 물건의 화면 좌표 */
  screenOf(p: Pick): { x: number; y: number } | null {
    let found: THREE.Object3D | null = null
    const key = pickKey(p)
    this.dyn.traverse((o) => {
      if (o.userData.pick && pickKey(o.userData.pick) === key) found = o
    })
    if (!found) return null
    const v = new THREE.Vector3()
    ;(found as THREE.Object3D).getWorldPosition(v)
    v.project(this.camera)
    const r = this.renderer.domElement.getBoundingClientRect()
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }
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
    for (const [x, z, ry] of [[0, -22, 0], [-26, 0, Math.PI / 2], [26, 0, -Math.PI / 2]] as const) {
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
    this.topView = !this.topView
    this.placeCamera()
  }

  private placeCamera() {
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
    const sharedMat = new Set<THREE.Material>([...Object.values(mat), ...faceMats.values(), ...coinMats.values()])
    for (const o of [...this.dyn.children]) {
      this.dyn.remove(o)
      o.traverse((x) => {
        if (x instanceof THREE.Sprite) x.material.dispose()
        if (x instanceof THREE.Mesh) {
          if (!sharedGeo.has(x.geometry)) x.geometry.dispose()
          if (!sharedMat.has(x.material)) (x.material as THREE.Material).dispose()
        }
      })
    }
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
        deck.userData.pick = { kind: 'deck', tier } satisfies Pick
        this.place(deck, L.deckX, z)
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
        this.place(cardMesh(cardFace(card(id)), { kind: 'market', tier, slot }), x, z)
      })
    }

    // 물건 더미
    TOKENS.forEach((t, i) => {
      const stack = this.coinStack(t, g.supply[t])
      if (t !== 'yeop') stack.userData.pick = { kind: 'supply', token: t } satisfies Pick
      const lifted = t !== 'yeop' && this.picked.includes(t as Color)
      this.place(stack, L.supplyX, L.supplyZ0 + i * L.supplyStep, lifted ? 0.3 : 0)
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
      if (p.id !== ctx.me) {
        const av = this.avatar(p, g)
        av.position.set(Math.sin(a) * L.avatarRX, 0, Math.cos(a) * L.avatarRZ)
        av.rotation.y = a + Math.PI
        this.dyn.add(av)
      }
    })

    // 마우스를 올린 것은 살짝 든다
    if (this.hoverKey) {
      this.dyn.traverse((o) => {
        if (o.userData.pick && pickKey(o.userData.pick) === this.hoverKey) o.position.y += 0.12
      })
    }
  }

  private place(o: THREE.Object3D, x: number, z: number, lift = 0) {
    o.position.set(x, L.top + L.cardT / 2 + lift, z)
    this.dyn.add(o)
  }

  private coinStack(t: Token, n: number): THREE.Group {
    const g = new THREE.Group()
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(geo.coin, coinMat(t))
      c.position.y = L.coinH / 2 + k * L.coinH
      c.rotation.y = k * 0.7
      g.add(c)
    }
    if (n === 0) g.add(slotMark(L.coinR * 2, L.coinR * 2))
    return g
  }

  private playerArea(p: PlayerView, g: HanyangView, mine: boolean): THREE.Group {
    const area = new THREE.Group()
    const current = g.current === g.players.indexOf(p) && g.phase !== 'over'
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 3.0).rotateX(-Math.PI / 2), current ? mat.turn : mat.slot)
    bg.position.y = 0.002
    area.add(bg)

    // 물건
    TOKENS.forEach((t, i) => {
      if (!p.tokens[t]) return
      const s = this.coinStack(t, p.tokens[t])
      s.position.set(-3.6 + i * 0.75, 0, 0.85)
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
      })
      pile.position.set(-3.6 + i * 1.1, L.cardT / 2, -0.45)
      area.add(pile)
    })
    // 찜한 카드
    p.reserved.forEach((r, index) => {
      const def = r.card ? card(r.card) : null
      const tex = def && (mine || !r.blind) ? cardFace(def) : cardBack(def?.tier ?? 1)
      const m = cardMesh(tex, mine ? ({ kind: 'reserved', index } satisfies Pick) : undefined)
      m.position.set(1.7 + index * 1.1, L.cardT / 2, 0.15)
      area.add(m)
    })
    // 데려온 명사
    p.patrons.forEach((id, i) => {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6).rotateX(-Math.PI / 2), faceMat(patronFace(patron(id))))
      t.position.set(1.7 + i * 0.7, 0.01, -1.05)
      area.add(t)
    })
    // 점수 (내 자리는 아바타가 없으니 여기 이름도)
    const text = mine ? `나 · ${pointsOf(p)}점` : `${pointsOf(p)}점`
    const score = label(text, mine ? 3.0 : 2.4, mine ? '#8e2b1f' : undefined)
    score.position.set(3.4, 0.6, -1.0)
    area.add(score)
    return area
  }

  private avatar(p: PlayerView, g: HanyangView): THREE.Group {
    const ctx = this.ctx!
    const color = ctx.colorOf(p.id)
    const av = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 2.0, 16), new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.9 }))
    body.position.y = 1.0
    av.add(body)
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.0, 0.25, 16), new THREE.MeshStandardMaterial({ color }))
    sash.position.y = 1.3
    av.add(sash)
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 16), new THREE.MeshStandardMaterial({ color: '#e9cfa9', roughness: 0.8 }))
    head.position.y = 2.6
    av.add(head)
    const rank = ctx.room.ranks[p.id]
    const away = !ctx.room.members.find((m) => m.id === p.id)?.connected && !p.id.startsWith('bot:')
    const tag = label(`${rank ? `[${rank}] ` : ''}${ctx.nameOf(p.id)}${away ? ' (자리 비움)' : ''}`, 4.4, color)
    tag.position.y = 3.7
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

  private hit(e: MouseEvent): { obj: THREE.Object3D; pick: Pick } | null {
    const r = this.renderer.domElement.getBoundingClientRect()
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.raycaster.setFromCamera(v, this.camera)
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
        return []
    }
  }

  private usable(p: Pick): boolean {
    if (p.kind === 'supply') return this.canPick() && (this.ctx!.room.game as HanyangView).supply[p.token] > 0
    return this.actionsFor(p).some((a) => this.can(a.action))
  }

  private setHover(key: string | null) {
    if (key === this.hoverKey) return
    this.hoverKey = key
    if (this.ctx) this.update(this.ctx)
  }

  private onMove(e: PointerEvent) {
    const hit = this.hit(e)
    const ok = hit && (this.usable(hit.pick) || hit.pick.kind === 'market' || hit.pick.kind === 'reserved')
    this.renderer.domElement.style.cursor = ok ? 'pointer' : ''
    this.setHover(ok ? pickKey(hit.pick) : null)
  }

  private onClick(e: MouseEvent) {
    const hit = this.hit(e)
    if (!hit) return this.closePopup()
    const p = hit.pick
    if (p.kind === 'supply') {
      this.closePopup()
      if (!this.usable(p)) return
      this.picked = this.picked.includes(p.token) ? this.picked.filter((c) => c !== p.token) : [...this.picked, p.token]
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

  private drawHud(g: HanyangView) {
    const ctx = this.ctx!
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
