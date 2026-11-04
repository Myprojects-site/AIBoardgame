// 3D 모양은 모두 여기서 만든다. 지금은 회색 상자(기본 도형)이고,
// 나중에 모델 파일(.glb)로 바꿀 때는 이 파일의 함수만 바꾸면 된다 — 테이블 코드는 그대로.
import * as THREE from 'three'
import type { Token } from '@aibg/shared/hanyang'
import { TOKEN_COLORS, coinFace, dieFace, portraitTexture } from './textures.ts'

export const COIN = { r: 0.32, h: 0.07 }

const coinGeo = new THREE.CylinderGeometry(COIN.r, COIN.r, COIN.h, 24)
// 옆면은 그 색, 윗면·아랫면은 토큰 그림(없으면 그 색)
const coinMats = new Map<Token, THREE.MeshStandardMaterial[]>()

/** 토큰 한 개. 같은 도형·재질을 함께 쓰므로 버리지 않는다 */
export function makeCoin(t: Token): THREE.Mesh {
  let m = coinMats.get(t)
  if (!m) {
    const metal = t === 'yeop' ? 0.5 : 0.05
    const side = new THREE.MeshStandardMaterial({ color: TOKEN_COLORS[t], roughness: 0.5, metalness: metal })
    const face = new THREE.MeshStandardMaterial({ map: coinFace(t), roughness: 0.5, metalness: metal })
    coinMats.set(t, (m = [side, face, face]))
  }
  const mesh = new THREE.Mesh(coinGeo, m)
  mesh.userData.shared = true
  return mesh
}

// 주사위: 상자 면 순서 [+x, -x, +y, -y, +z, -z]에 눈을 붙인다. 맞은편 눈의 합은 7.
const DIE_FACES = [3, 4, 1, 6, 2, 5]
const dieGeo = new THREE.BoxGeometry(0.7, 0.7, 0.7)
let dieMats: THREE.MeshStandardMaterial[] | null = null

export function makeDie(): THREE.Mesh {
  dieMats ??= DIE_FACES.map((v) => new THREE.MeshStandardMaterial({ map: dieFace(v), roughness: 0.5 }))
  const m = new THREE.Mesh(dieGeo, dieMats)
  m.userData.shared = true
  return m
}

/** 눈 v가 위로 오게 돌린 방향 (그 위에 좌우 회전 yaw) */
export function dieRotation(v: number, yaw: number): THREE.Quaternion {
  const e: Record<number, [number, number, number]> = {
    1: [0, 0, 0],
    6: [Math.PI, 0, 0],
    2: [-Math.PI / 2, 0, 0],
    5: [Math.PI / 2, 0, 0],
    3: [0, 0, Math.PI / 2],
    4: [0, 0, -Math.PI / 2],
  }
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...e[v]!))
  return q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw))
}

// 사람 = 프로필 사진 판 (11/4: 옷차림 아바타 대신). 늘 카메라를 본다.
export const PORTRAIT = { size: 2.5, centerY: 2.1 }

export function makePortrait(photo: string, color: string, king: boolean): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: portraitTexture(photo, color, king), transparent: true }))
  s.scale.set(PORTRAIT.size, PORTRAIT.size * (288 / 256), 1)
  return s
}
