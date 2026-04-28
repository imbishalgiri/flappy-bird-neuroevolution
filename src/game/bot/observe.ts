import type { Bird } from '../entities/Bird'
import type { PipeSystem } from '../entities/PipeSystem'

// Observation vector for the bot:
// [0] bird_y_norm (0..1)
// [1] bird_vy_norm (~-1..1)
// [2] next_pipe_dx_norm (0..1+)
// [3] gap_center_y_norm (0..1)
// [4] bird_to_gap_center_y_norm (~-1..1)
export function observe(opts: {
  worldW: number
  worldH: number
  ceiling: number
  groundY: number
  bird: Bird
  pipes: PipeSystem
}): number[] {
  const { worldW, ceiling, groundY, bird, pipes } = opts

  const playableH = Math.max(1, groundY - ceiling)
  const birdY = clamp01((bird.y - ceiling) / playableH)
  const birdVy = clamp(bird.vy / 1000, -1.5, 1.5) / 1.5

  const next = pipes.pipes.find((p) => p.x + pipes.pipeWidth >= bird.x) ?? pipes.pipes[0]
  const nextDx = next ? (next.x - bird.x) / worldW : 1
  const gapY = next ? clamp01((next.gapY - ceiling) / playableH) : 0.5

  const birdToGap = clamp((birdY - gapY) * 2, -1, 1)

  return [birdY, birdVy, clamp(nextDx, -0.25, 2), gapY, birdToGap]
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

