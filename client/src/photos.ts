// 프로필 사진: 방에서 받은 사진 묶음을 들고, 고른 사진을 작게 잘라 만든다.
import { TUTORIAL_GUIDE } from '@aibg/shared/core/types'
import { ROOM, isBot } from '@aibg/shared/room'
import { artUrl, hasArt } from './art.ts'

const GUIDE_ART = 'guide/gaekju'

const PHOTO_PX = 96
const QUALITY = 0.82

let photos: Record<string, string> = {}
let version = 0

export function setPhotos(p: Record<string, string>) {
  photos = p
  version++
}

export const getPhoto = (id: string): string | undefined => photos[id]
/** 사진이 바뀌면 오른다. 3D 판이 다시 만들지 판단할 때 */
export const photosVersion = () => version

/** 고른 그림 파일을 가운데 정사각형으로 잘라 96px JPEG data URL로 */
export async function shrinkPhoto(file: File): Promise<string> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = PHOTO_PX
  const g = canvas.getContext('2d')!
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX)
  bmp.close()
  let url = canvas.toDataURL('image/jpeg', QUALITY)
  if (url.length > ROOM.photoMaxLength) url = canvas.toDataURL('image/jpeg', 0.5)
  if (url.length > ROOM.photoMaxLength) throw new Error('사진이 너무 커요')
  return url
}

// 사진을 안 올린 사람은 기본 사진: 내 색 바탕에 사람 실루엣. AI는 로봇. 각자 화면에서 그려서 주고받지 않는다.
const defaults = new Map<string, string>()

function defaultPhoto(kind: 'person' | 'bot', color: string): string {
  const key = `${kind}:${color}`
  const hit = defaults.get(key)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = c.height = PHOTO_PX
  const g = c.getContext('2d')!
  const s = PHOTO_PX
  const grad = g.createLinearGradient(0, 0, 0, s)
  grad.addColorStop(0, color)
  grad.addColorStop(1, '#2b2420')
  g.fillStyle = grad
  g.fillRect(0, 0, s, s)
  g.fillStyle = 'rgba(255,250,240,0.92)'
  if (kind === 'person') {
    g.beginPath()
    g.arc(s / 2, s * 0.4, s * 0.18, 0, Math.PI * 2) // 머리
    g.fill()
    g.beginPath()
    g.ellipse(s / 2, s * 0.98, s * 0.34, s * 0.3, 0, Math.PI, 0) // 어깨
    g.fill()
  } else {
    g.beginPath()
    g.roundRect(s * 0.24, s * 0.28, s * 0.52, s * 0.42, s * 0.1) // 로봇 머리
    g.fill()
    g.fillRect(s * 0.48, s * 0.14, s * 0.04, s * 0.14) // 안테나
    g.beginPath()
    g.arc(s / 2, s * 0.13, s * 0.05, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = color
    for (const x of [0.38, 0.62]) {
      g.beginPath()
      g.arc(s * x, s * 0.46, s * 0.06, 0, Math.PI * 2) // 눈
      g.fill()
    }
    g.fillRect(s * 0.38, s * 0.58, s * 0.24, s * 0.04) // 입
    g.fillStyle = 'rgba(255,250,240,0.92)'
    g.fillRect(s * 0.3, s * 0.76, s * 0.4, s * 0.24) // 몸
  }
  const url = c.toDataURL('image/png')
  defaults.set(key, url)
  return url
}

/** 이 사람을 보여 줄 사진: 올린 사진, 없으면 기본 사진 */
export function photoFor(id: string, color: string): string {
  // 튜토리얼 객주는 그림이 있으면 그 그림 (6단계)
  if (id === TUTORIAL_GUIDE && hasArt(GUIDE_ART)) return artUrl(GUIDE_ART)
  return getPhoto(id) ?? defaultPhoto(isBot(id) ? 'bot' : 'person', isBot(id) ? '#7d8a96' : color)
}
