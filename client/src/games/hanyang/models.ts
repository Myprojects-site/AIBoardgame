// 3D 모양은 모두 여기서 만든다. 지금은 회색 상자(기본 도형)이고,
// 나중에 모델 파일(.glb)로 바꿀 때는 이 파일의 함수만 바꾸면 된다 — 테이블 코드는 그대로.
import * as THREE from 'three'
import type { Rank } from '@aibg/shared/core/rank'
import type { Token } from '@aibg/shared/hanyang'
import { TOKEN_COLORS } from './textures.ts'

export const COIN = { r: 0.32, h: 0.07 }

const coinGeo = new THREE.CylinderGeometry(COIN.r, COIN.r, COIN.h, 24)
const coinMats = new Map<Token, THREE.MeshStandardMaterial>()

/** 토큰 한 개. 같은 도형·재질을 함께 쓰므로 버리지 않는다 */
export function makeCoin(t: Token): THREE.Mesh {
  let m = coinMats.get(t)
  if (!m) coinMats.set(t, (m = new THREE.MeshStandardMaterial({ color: TOKEN_COLORS[t], roughness: 0.5, metalness: t === 'yeop' ? 0.5 : 0.05 })))
  const mesh = new THREE.Mesh(coinGeo, m)
  mesh.userData.shared = true
  return mesh
}

// 신분별 옷차림 (기획서 3.5장)
const RANK_LOOK: Record<Rank, { body: string; hat: 'none' | 'band' | 'tanggeon' | 'gat' | 'king' }> = {
  천민: { body: '#8f877a', hat: 'none' },
  상민: { body: '#d3cab6', hat: 'band' },
  중인: { body: '#6f8199', hat: 'tanggeon' },
  양반: { body: '#ece7dc', hat: 'gat' },
  왕: { body: '#a8282a', hat: 'king' },
}

/** 앉은 사람. 원점은 바닥, 상 쪽이 로컬 -z. 머리 위 이름표 높이는 avatarHeadY */
export const avatarHeadY = 2.6

export function makeAvatar(rank: Rank, color: string): THREE.Group {
  const look = RANK_LOOK[rank]
  const std = (c: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: rough })
  const av = new THREE.Group()
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.25, 2.0, 18), std(look.body))
  body.position.y = 1.0
  av.add(body)
  // 내 색: 띠
  const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.93, 0.98, 0.22, 18), std(color, 0.6))
  sash.position.y = 1.35
  av.add(sash)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 16), std('#e9cfa9', 0.8))
  head.position.y = avatarHeadY
  av.add(head)

  const black = std('#1c1a18', 0.6)
  const hy = avatarHeadY
  switch (look.hat) {
    case 'band': {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.07, 8, 24), std('#f4f0e6'))
      band.rotation.x = Math.PI / 2
      band.position.y = hy + 0.2
      av.add(band)
      break
    }
    case 'tanggeon': {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 0.45, 18), black)
      cap.position.y = hy + 0.45
      av.add(cap)
      break
    }
    case 'gat': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.03, 32), new THREE.MeshStandardMaterial({ color: '#1c1a18', transparent: true, opacity: 0.85 }))
      brim.position.y = hy + 0.38
      av.add(brim)
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.6, 18), black)
      crown.position.y = hy + 0.68
      av.add(crown)
      break
    }
    case 'king': {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.55, 18), black)
      cap.position.y = hy + 0.45
      av.add(cap)
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.05), black)
        wing.position.set(s * 0.35, hy + 0.8, 0.35)
        av.add(wing)
      }
      const trim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 8, 28), new THREE.MeshStandardMaterial({ color: '#e0b84a', metalness: 0.6, roughness: 0.3 }))
      trim.rotation.x = Math.PI / 2
      trim.position.y = 1.7
      av.add(trim)
      break
    }
    case 'none':
      break
  }
  return av
}
