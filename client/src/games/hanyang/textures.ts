// 회색 상자 단계의 글자 텍스처 (기획서 6장 3단계). 6단계에서 픽셀 아트로 바뀐다.
import * as THREE from 'three'
import { COLORS, TIER_NAMES, TOKEN_NAMES, type CardDef, type Cost, type PatronDef, type Tier, type Token } from '@aibg/shared/hanyang'

export const TOKEN_COLORS: Record<Token, string> = {
  cheong: '#3a8f8a',
  jeok: '#c0392b',
  hwang: '#c9a227',
  baek: '#f2ede0',
  heuk: '#2f2f2f',
  yeop: '#a07a3e',
}
const TOKEN_TEXT: Record<Token, string> = { cheong: '#fff', jeok: '#fff', hwang: '#2b2420', baek: '#2b2420', heuk: '#fff', yeop: '#fff' }
const TIER_BG: Record<Tier, string> = { 1: '#efe2c4', 2: '#e6cba6', 3: '#d9b48f' }
const FONT = `'Malgun Gothic', system-ui, sans-serif`

const cache = new Map<string, THREE.CanvasTexture>()

function texture(key: string, w: number, hgt: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = cache.get(key)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = hgt
  draw(canvas.getContext('2d')!)
  const t = new THREE.CanvasTexture(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  cache.set(key, t)
  return t
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

function coin(g: CanvasRenderingContext2D, x: number, y: number, r: number, token: Token, text: string) {
  g.beginPath()
  g.arc(x, y, r, 0, Math.PI * 2)
  g.fillStyle = TOKEN_COLORS[token]
  g.fill()
  g.lineWidth = 3
  g.strokeStyle = 'rgba(0,0,0,0.45)'
  g.stroke()
  g.fillStyle = TOKEN_TEXT[token]
  g.font = `bold ${Math.round(r * 1.1)}px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, x, y + 1)
}

function costRow(g: CanvasRenderingContext2D, cost: Cost, y: number, w: number) {
  const items = COLORS.filter((c) => cost[c])
  const r = 26
  const gap = 8
  const total = items.length * (r * 2) + (items.length - 1) * gap
  let x = (w - total) / 2 + r
  for (const c of items) {
    coin(g, x, y, r, c, String(cost[c]))
    x += r * 2 + gap
  }
}

function wrapCenter(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (g.measureText(next).width > maxW && line) {
      lines.push(line)
      line = word
    } else line = next
  }
  lines.push(line)
  lines.forEach((l, i) => g.fillText(l, x, y + (i - (lines.length - 1) / 2) * lineH))
}

export const CARD_W = 1.0
export const CARD_H = 1.4

export function cardFace(c: CardDef): THREE.CanvasTexture {
  return texture(`card:${c.id}`, 256, 358, (g) => {
    g.fillStyle = TIER_BG[c.tier]
    roundRect(g, 0, 0, 256, 358, 18)
    g.fill()
    g.lineWidth = 6
    g.strokeStyle = '#7a5a3a'
    g.stroke()
    g.fillStyle = '#2b2420'
    g.textAlign = 'left'
    g.textBaseline = 'top'
    g.font = `bold 64px ${FONT}`
    if (c.points) g.fillText(String(c.points), 18, 12)
    coin(g, 212, 46, 30, c.color, '')
    g.font = `20px ${FONT}`
    g.textAlign = 'center'
    g.fillText(`${TIER_NAMES[c.tier]} · ${TOKEN_NAMES[c.color]} 할인`, 128, 104)
    g.font = `bold 34px ${FONT}`
    g.textBaseline = 'middle'
    wrapCenter(g, c.name, 128, 190, 220, 40)
    costRow(g, c.cost, 310, 256)
  })
}

/** 펼쳐 보기 창에 쓰는 카드 그림 (3D와 같은 그림) */
const images = new Map<string, string>()
export function cardImage(c: CardDef): string {
  let url = images.get(c.id)
  if (!url) images.set(c.id, (url = (cardFace(c).image as HTMLCanvasElement).toDataURL()))
  return url
}

export function cardBack(tier: Tier): THREE.CanvasTexture {
  return texture(`back:${tier}`, 256, 358, (g) => {
    g.fillStyle = ['', '#6b4e2e', '#5a3a5e', '#2e4a5e'][tier]!
    roundRect(g, 0, 0, 256, 358, 18)
    g.fill()
    g.strokeStyle = '#e8d6a8'
    g.lineWidth = 8
    roundRect(g, 16, 16, 224, 326, 12)
    g.stroke()
    g.fillStyle = '#e8d6a8'
    g.font = `bold 48px ${FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(TIER_NAMES[tier], 128, 179)
  })
}

export function patronFace(p: PatronDef): THREE.CanvasTexture {
  return texture(`patron:${p.id}`, 256, 256, (g) => {
    g.fillStyle = '#f6efe0'
    roundRect(g, 0, 0, 256, 256, 16)
    g.fill()
    g.lineWidth = 6
    g.strokeStyle = '#8e2b1f'
    g.stroke()
    g.fillStyle = '#2b2420'
    g.textAlign = 'left'
    g.textBaseline = 'top'
    g.font = `bold 56px ${FONT}`
    g.fillText(String(p.points), 16, 10)
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = `bold 40px ${FONT}`
    g.fillText(p.name, 140, 46)
    g.font = `22px ${FONT}`
    g.fillText('명사 방문', 128, 110)
    costRow(g, p.need, 196, 256)
  })
}

/** 주사위 한 면 (눈 1~6). 1은 붉은 눈 */
export function dieFace(v: number): THREE.CanvasTexture {
  const spots: Record<number, [number, number][]> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
    6: [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
  }
  return texture(`die:${v}`, 128, 128, (g) => {
    g.fillStyle = '#f6f1e4'
    roundRect(g, 0, 0, 128, 128, 20)
    g.fill()
    g.fillStyle = v === 1 ? '#b8322a' : '#2b2420'
    for (const [x, y] of spots[v]!) {
      g.beginPath()
      g.arc(x * 128, y * 128, v === 1 ? 17 : 11, 0, Math.PI * 2)
      g.fill()
    }
  })
}

/** 프로필 사진 판: 둥근 사진에 내 색 테두리. 왕은 금테와 관 */
export function portraitTexture(photo: string, color: string, king: boolean): THREE.CanvasTexture {
  return texture(`portrait:${color}:${king}:${photo}`, 256, 288, (g) => {
    const cx = 128
    const cy = 160
    const r = 112
    const frame = () => {
      g.beginPath()
      g.arc(cx, cy, r, 0, Math.PI * 2)
      g.lineWidth = king ? 16 : 12
      g.strokeStyle = king ? '#e0b84a' : color
      g.stroke()
      if (king) {
        g.font = `64px ${FONT}`
        g.textAlign = 'center'
        g.textBaseline = 'middle'
        g.fillText('👑', cx, 34)
      }
    }
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fillStyle = '#3a312b'
    g.fill()
    frame()
    // 사진은 불러온 뒤에 그린다 (data URL이라 금방)
    const img = new Image()
    img.onload = () => {
      g.save()
      g.beginPath()
      g.arc(cx, cy, r - 4, 0, Math.PI * 2)
      g.clip()
      g.drawImage(img, cx - r, cy - r, r * 2, r * 2)
      g.restore()
      frame()
      const t = cache.get(`portrait:${color}:${king}:${photo}`)
      if (t) t.needsUpdate = true
    }
    img.src = photo
  })
}

/** 다른 사람 손: 그 사람 색 동그라미에 손 */
export function handTexture(color: string): THREE.CanvasTexture {
  return texture(`hand:${color}`, 128, 128, (g) => {
    g.beginPath()
    g.arc(64, 64, 54, 0, Math.PI * 2)
    g.fillStyle = color
    g.globalAlpha = 0.85
    g.fill()
    g.globalAlpha = 1
    g.lineWidth = 6
    g.strokeStyle = '#fff'
    g.stroke()
    g.font = `64px ${FONT}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('✋', 64, 68)
  })
}

/** 머리 위 이름표나 개수처럼 늘 카메라를 보는 글자 */
export function labelTexture(text: string, color = '#2b2420', bg = 'rgba(255,250,240,0.92)'): THREE.CanvasTexture {
  return texture(`label:${text}:${color}:${bg}`, 512, 96, (g) => {
    g.font = `bold 44px ${FONT}`
    const w = Math.min(500, g.measureText(text).width + 40)
    g.fillStyle = bg
    roundRect(g, (512 - w) / 2, 8, w, 80, 24)
    g.fill()
    g.fillStyle = color
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, 256, 50)
  })
}
