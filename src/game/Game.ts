import type { GameMode } from './state'
import { Bird } from './entities/Bird'
import { PipeSystem } from './entities/PipeSystem'
import { rectsOverlap } from './math/aabb'
import { installInput } from './input/input'
import { render } from './render/render'
import { gameConfig } from './config'
import { BotController } from './bot/BotController'
import { CanvasTrainSession } from './bot/canvasTrainSession'
import { GameSounds } from './audio/gameSounds'

export class Game {
  private worldW = gameConfig.world.w
  private worldH = gameConfig.world.h
  private ceiling = gameConfig.world.ceiling
  private groundHeight = gameConfig.world.groundHeight

  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly bird: Bird
  private readonly pipes: PipeSystem
  private readonly bot = new BotController()
  private readonly sounds = new GameSounds()

  private mode: GameMode = 'ready'
  private score = 0
  private bestScore = 0

  private lastTs = 0
  private raf = 0
  private cleanupInput: null | (() => void) = null

  // Tunables
  private gravity = gameConfig.physics.gravity
  private flapImpulse = gameConfig.physics.flapImpulse
  private maxFallSpeed = gameConfig.physics.maxFallSpeed
  private readonly flapVelocityBlend = 0.65

  private training: CanvasTrainSession | null = null
  private readonly trainingDtMult = 3.5
  private readonly trainingPopulation = 36

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D canvas not supported')
    this.ctx = ctx

    this.bird = new Bird({
      x: gameConfig.bird.x,
      y: this.worldH * gameConfig.bird.yFrac,
      radius: gameConfig.bird.radius,
    })
    this.pipes = new PipeSystem({
      pipeWidth: gameConfig.pipes.pipeWidth,
      gapSize: gameConfig.pipes.gapSize,
      speed: gameConfig.pipes.speed,
      spawnEvery: gameConfig.pipes.spawnEvery,
    })

    this.resize()
    window.addEventListener('resize', this.resize)

    this.cleanupInput = installInput({
      flap: () => this.onFlap(),
      restart: () => this.onRestartKey(),
      toggleBot: () => this.bot.toggle(),
      exitTrain: () => this.onExitTrainKey(),
      nextTrainEpoch: () => this.onNextTrainEpochKey(),
      quit: () => this.onQuitToTitle(),
    })
  }

  getMode(): GameMode {
    return this.mode
  }

  isAwaitingTrainingEpoch(): boolean {
    return this.mode === 'training' && (this.training?.isAwaitingNextEpoch() ?? false)
  }

  /** New random population + first visual epoch (title screen only). */
  startEpochTraining(): void {
    if (this.mode !== 'ready') return
    this.bot.disable()
    this.training?.dispose()
    this.training = new CanvasTrainSession(
      {
        getWorldW: () => this.worldW,
        getWorldH: () => this.worldH,
        getCeiling: () => this.ceiling,
        getGroundY: () => this.worldH - this.groundHeight,
        getGravity: () => this.gravity,
        getFlapImpulse: () => this.flapImpulse,
        getMaxFallSpeed: () => this.maxFallSpeed,
        bird: this.bird,
        pipes: this.pipes,
      },
      this.trainingPopulation,
      (json) => this.bot.setPolicy(json),
    )
    this.training.startFirstEpoch()
    this.mode = 'training'
    this.score = 0
    if (!this.raf) this.start()
  }

  /** Continue after one epoch completes (breeding already applied). */
  advanceTrainingEpoch(): void {
    if (this.mode !== 'training' || !this.training) return
    this.training.advanceEpoch()
    if (!this.raf) this.start()
  }

  start() {
    this.stop()
    this.lastTs = performance.now()
    this.raf = requestAnimationFrame(this.onFrame)
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  destroy() {
    this.stop()
    this.training?.dispose()
    this.training = null
    window.removeEventListener('resize', this.resize)
    this.cleanupInput?.()
    this.cleanupInput = null
  }

  private resize = () => {
    if (this.mode === 'training') {
      this.exitTraining()
    }

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1))

    // Full-bleed UI: make the *world* match the viewport (no bars, no cropping, no distortion).
    const vw = Math.max(1, Math.floor(window.innerWidth))
    const vh = Math.max(1, Math.floor(window.innerHeight))

    this.worldW = vw
    this.worldH = vh
    this.ceiling = gameConfig.world.ceiling

    const sx = vw / gameConfig.world.w
    const sy = vh / gameConfig.world.h

    this.groundHeight = Math.round(gameConfig.world.groundHeight * sy)
    this.gravity = gameConfig.physics.gravity * sy
    this.flapImpulse = gameConfig.physics.flapImpulse * sy
    this.maxFallSpeed = gameConfig.physics.maxFallSpeed * sy

    this.bird.resize({
      x: gameConfig.bird.x * sx,
      radius: gameConfig.bird.radius * sy,
    })
    this.bird.reset(this.worldH * gameConfig.bird.yFrac)

    this.pipes.resize({
      pipeWidth: gameConfig.pipes.pipeWidth * sx,
      gapSize: gameConfig.pipes.gapSize * sy,
      speed: gameConfig.pipes.speed * sx,
      spawnEvery: gameConfig.pipes.spawnEvery,
    })

    this.canvas.width = Math.floor(vw * dpr)
    this.canvas.height = Math.floor(vh * dpr)
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    this.ctx.imageSmoothingEnabled = true
  }

  private onFrame = (ts: number) => {
    const dt = clamp((ts - this.lastTs) / 1000, 0, 0.05)
    this.lastTs = ts

    this.step(dt)
    this.draw()

    if (this.mode === 'gameOver' || this.isAwaitingTrainingEpoch()) {
      this.raf = 0
      return
    }
    this.raf = requestAnimationFrame(this.onFrame)
  }

  private step(dt: number) {
    if (this.mode === 'gameOver') return
    if (this.mode === 'training' && this.training?.isAwaitingNextEpoch()) return

    const groundY = this.worldH - this.groundHeight

    if (this.mode === 'training') {
      const d = dt * this.trainingDtMult
      this.training?.step(d)
    } else if (this.mode === 'playing') {
      const nowSec = performance.now() / 1000
      if (this.bot.step({ nowSec, worldW: this.worldW, worldH: this.worldH, ceiling: this.ceiling, groundY, bird: this.bird, pipes: this.pipes })) {
        this.applyFlap()
      }

      this.bird.step(dt, this.gravity, this.maxFallSpeed)
      this.pipes.step(dt, this.worldW, this.ceiling, groundY)

      this.updateScore()
      if (this.checkCollision()) {
        this.enterGameOver()
      }
    } else if (this.mode === 'ready') {
      // gentle bob
      this.bird.y = this.worldH * gameConfig.bird.yFrac + Math.sin(performance.now() / 280) * 10
    }

    // ground/ceiling constraints
    const r = this.bird.radius
    if (this.bird.y < this.ceiling + r) {
      this.bird.y = this.ceiling + r
      this.bird.vy = 0
    }
    if (this.bird.y > groundY - r) {
      this.bird.y = groundY - r
      if (this.mode === 'playing') {
        this.enterGameOver()
      }
      this.bird.vy = 0
    }
  }

  private onFlap() {
    if (this.mode === 'training') {
      return
    }

    if (this.mode === 'ready') {
      this.mode = 'playing'
      this.score = 0
      this.pipes.reset()
      this.bird.reset(this.worldH * gameConfig.bird.yFrac)
      this.applyFlap()
      return
    }

    if (this.mode === 'playing') {
      this.applyFlap()
      return
    }

    if (this.mode === 'gameOver') {
      this.restart()
    }
  }

  private onRestartKey() {
    if (this.mode === 'training') return
    this.restart()
  }

  private onExitTrainKey() {
    if (this.mode === 'training') {
      this.exitTraining()
    }
  }

  private onNextTrainEpochKey() {
    if (this.isAwaitingTrainingEpoch()) {
      this.advanceTrainingEpoch()
    }
  }

  private exitTraining() {
    this.training?.dispose()
    this.training = null
    this.pipes.reset()
    this.bird.reset(this.worldH * gameConfig.bird.yFrac)
    this.mode = 'ready'
    this.score = 0
    if (!this.raf) this.start()
  }

  private applyFlap() {
    const targetVy = -this.flapImpulse
    this.bird.vy = this.bird.vy * (1 - this.flapVelocityBlend) + targetVy * this.flapVelocityBlend
    this.sounds.playSwoosh()
  }

  private enterGameOver() {
    if (this.mode !== 'playing') return
    this.mode = 'gameOver'
    this.bestScore = Math.max(this.bestScore, this.score)
    this.sounds.playFailure()
  }

  private restart() {
    if (this.mode !== 'gameOver') return
    this.mode = 'ready'
    this.score = 0
    this.pipes.reset()
    this.bird.reset(this.worldH * gameConfig.bird.yFrac)
    this.start()
  }

  /** Esc — leave play / game over and return to title (no failure sound). */
  private onQuitToTitle() {
    this.bot.disable()
    if (this.mode === 'training') {
      this.exitTraining()
      return
    }
    this.mode = 'ready'
    this.score = 0
    this.pipes.reset()
    this.bird.reset(this.worldH * gameConfig.bird.yFrac)
    if (!this.raf) this.start()
  }

  private updateScore() {
    for (const p of this.pipes.pipes) {
      if (!p.scored && p.x + this.pipes.pipeWidth < this.bird.x) {
        p.scored = true
        this.score += 1
        this.sounds.playSuccess()
      }
    }
  }

  private checkCollision(): boolean {
    const groundY = this.worldH - this.groundHeight
    const birdRect = this.bird.getRect()
    const rects = this.pipes.getRects(this.ceiling, groundY)
    for (const r of rects) {
      if (rectsOverlap(birdRect, r.top) || rectsOverlap(birdRect, r.bottom)) return true
    }
    return false
  }

  private draw() {
    const groundY = this.worldH - this.groundHeight
    const trainingHud = this.mode === 'training' ? this.training?.getHud() : undefined
    const swarm = this.mode === 'training' ? (this.training?.getSwarmRender() ?? []) : []
    const trainScore = this.mode === 'training' ? 0 : this.score
    render(this.ctx, {
      mode: this.mode,
      worldW: this.worldW,
      worldH: this.worldH,
      ceiling: this.ceiling,
      groundY,
      score: trainScore,
      bestScore: this.bestScore,
      botEnabled: this.bot.enabled,
      trainingVisual: this.mode === 'training' && swarm.length === 0,
      trainingHud,
      trainingSwarm: swarm.length > 0 ? swarm : undefined,
      bird: this.bird,
      pipes: this.pipes,
    })
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

