// 소리 (기획서 3.3장). 지금은 WebAudio로 합성한다. 녹음한 소리로 바꿀 때는 sfx의 각 함수만 바꾼다.
import { load, store } from './identity.ts'

let ac: AudioContext | null = null
let muted = load<boolean>('muted') ?? false

export const isMuted = () => muted
export function setMuted(m: boolean) {
  muted = m
  store('muted', m)
}

// 브라우저는 사용자가 한 번 누르기 전에는 소리를 막는다. 막혀 있으면 조용히 넘어간다.
function audio(): AudioContext | null {
  if (muted) return null
  try {
    ac ??= new AudioContext()
    if (ac.state === 'suspended') void ac.resume()
    return ac.state === 'running' ? ac : null
  } catch {
    return null
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, when = 0, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + when
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(gain, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, gain: number, freq: number, when = 0) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + when
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
  const src = a.createBufferSource()
  src.buffer = buf
  const f = a.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = freq
  const g = a.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(a.destination)
  src.start(t)
}

let lastCoin = 0
export const sfx = {
  /** 토큰 놓는 소리. 한꺼번에 여러 개면 몇 개만 */
  coin(when = 0) {
    const now = performance.now()
    if (now - lastCoin < 40 && when === 0) return
    lastCoin = now
    tone(2400 + Math.random() * 400, 0.07, 'triangle', 0.07, when)
    tone(3600, 0.05, 'sine', 0.035, when + 0.015)
  },
  card() {
    noise(0.14, 0.25, 1600)
  },
  turn() {
    tone(660, 0.18, 'sine', 0.12)
    tone(990, 0.3, 'sine', 0.1, 0.13)
  },
  pop() {
    tone(700, 0.09, 'sine', 0.08, 0, 1200)
  },
  rankUp() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, i * 0.09))
  },
  king() {
    ;[392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.35, 'triangle', 0.09, i * 0.12))
    noise(0.6, 0.1, 6000, 0.7)
  },
}
