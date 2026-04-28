import type { Rect } from '../state'

export class Bird {
  x: number
  y: number
  vy = 0

  radius: number

  constructor(opts: { x: number; y: number; radius: number }) {
    this.x = opts.x
    this.y = opts.y
    this.radius = opts.radius
  }

  reset(y: number) {
    this.y = y
    this.vy = 0
  }

  resize(opts: { x: number; radius: number }) {
    this.x = opts.x
    this.radius = opts.radius
  }

  flap(impulse: number) {
    this.vy = -impulse
  }

  step(dt: number, gravity: number, maxFallSpeed: number) {
    this.vy += gravity * dt
    if (this.vy > maxFallSpeed) this.vy = maxFallSpeed
    this.y += this.vy * dt
  }

  getRect(): Rect {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2,
    }
  }
}

