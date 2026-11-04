// 손 위치·보는 중·반응: 방에서 받은 순간 정보를 판(3D 테이블)에 바로 넘긴다. 다시 그리기를 거치지 않는다.
import type { HostMsg } from '@aibg/shared/room'

export type Ephemeral = Extract<HostMsg, { t: 'presence' | 'react' }>
type Listener = (m: Ephemeral) => void

const listeners = new Set<Listener>()

export function onEphemeral(f: Listener): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

export function emitEphemeral(m: Ephemeral): void {
  for (const f of listeners) f(m)
}
