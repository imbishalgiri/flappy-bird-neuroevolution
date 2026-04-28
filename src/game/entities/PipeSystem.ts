import type { Rect } from '../state'

export type PipePair = {
  x: number
  gapY: number
  scored: boolean
}

export class PipeSystem {
  pipes: PipePair[] = []
  private spawnTimer = 0

  pipeWidth: number
  gapSize: number
  speed: number
  spawnEvery: number

  constructor(opts: { pipeWidth: number; gapSize: number; speed: number; spawnEvery: number }) {
    this.pipeWidth = opts.pipeWidth
    this.gapSize = opts.gapSize
    this.speed = opts.speed
    this.spawnEvery = opts.spawnEvery
  }

  resize(opts: { pipeWidth: number; gapSize: number; speed: number; spawnEvery: number }) {
    this.pipeWidth = opts.pipeWidth
    this.gapSize = opts.gapSize
    this.speed = opts.speed
    this.spawnEvery = opts.spawnEvery
    this.reset()
  }

  reset() {
    this.pipes = []
    this.spawnTimer = 0
  }

  step(dt: number, worldW: number, ceiling: number, groundY: number) {
    this.spawnTimer += dt
    while (this.spawnTimer >= this.spawnEvery) {
      this.spawnTimer -= this.spawnEvery
      this.spawn(worldW, ceiling, groundY)
    }

    for (const p of this.pipes) p.x -= this.speed * dt
    const keepFromX = -this.pipeWidth - 10
    while (this.pipes.length && this.pipes[0].x < keepFromX) this.pipes.shift()
  }

  private spawn(worldW: number, ceiling: number, groundY: number) {
    const margin = 24
    const minGapCenter = ceiling + margin + this.gapSize / 2
    const maxGapCenter = groundY - margin - this.gapSize / 2
    const gapCenter = lerp(minGapCenter, maxGapCenter, Math.random())

    this.pipes.push({ x: worldW + 40, gapY: gapCenter, scored: false })
  }

  getRects(ceiling: number, groundY: number): Array<{ top: Rect; bottom: Rect; x: number }> {
    return this.pipes.map((p) => {
      const topH = Math.max(0, p.gapY - this.gapSize / 2 - ceiling)
      const bottomY = p.gapY + this.gapSize / 2
      const bottomH = Math.max(0, groundY - bottomY)

      return {
        x: p.x,
        top: { x: p.x, y: ceiling, w: this.pipeWidth, h: topH },
        bottom: { x: p.x, y: bottomY, w: this.pipeWidth, h: bottomH },
      }
    })
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

