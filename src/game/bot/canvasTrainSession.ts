import { gameConfig } from '../config'
import type { Bird } from '../entities/Bird'
import type { PipeSystem } from '../entities/PipeSystem'
import { rectsOverlap } from '../math/aabb'
import { observe } from './observe'
import { MlpPolicy, type MlpPolicyJson } from './Policy'
import { mulberry32 } from './mulberry32'

export type TrainingRefs = {
  getWorldW: () => number
  getWorldH: () => number
  getCeiling: () => number
  getGroundY: () => number
  getGravity: () => number
  getFlapImpulse: () => number
  getMaxFallSpeed: () => number
  bird: Bird
  pipes: PipeSystem
}

export type SwarmRenderDot = { x: number; y: number; vy: number; r: number }

function fitness(score: number, t: number): number {
  return score * 1000 + t
}

const PARALLEL_ROUNDS = 1
const SIGMA = 0.18
const MUT_PROB = 0.12
const HIDDEN = 6
const FLAP_BLEND = 0.65
/** Wall-clock cap per parallel round (seconds) so a round always ends. */
const ROUND_MAX_SEC = 120

type SwarmAgent = {
  policy: MlpPolicy
  x: number
  y: number
  vy: number
  dead: boolean
  tAlive: number
  lastFlapAt: number
  roundScore: number
}

function countPipesPassed(birdX: number, pipeWidth: number, pipes: PipeSystem): number {
  return pipes.pipes.filter((p) => p.x + pipeWidth < birdX).length
}

/**
 * All policies fly **at once** on the same pipe stream for one round per epoch,
 * then breeding waits for `advanceEpoch()`.
 */
export class CanvasTrainSession {
  private readonly refs: TrainingRefs
  private readonly cooldown: number
  private readonly population: number
  private readonly elite: number
  private readonly master: () => number
  private readonly nextSeed: () => number
  private pop: MlpPolicy[] = []
  private gen = 0
  private agents: SwarmAgent[] = []
  private roundIndex = 0
  /** Per-agent fitness for each finished parallel round */
  private roundFits: number[][] = []
  private roundBestPipes: number[][] = []
  private clock = 0
  private roundClock = 0
  private rows: { meanFit: number; bestPipes: number; net: MlpPolicy }[] = []
  private bestEver: MlpPolicy | null = null
  private bestFitEver = -1e18
  private lastHud = ''
  private readonly onBest?: (json: MlpPolicyJson) => void
  private awaitingNextEpoch = false
  private agentRadius = 16

  constructor(refs: TrainingRefs, population: number, onBest?: (json: MlpPolicyJson) => void) {
    this.refs = refs
    this.onBest = onBest
    this.cooldown = gameConfig.bot.flapCooldownSec
    const pop = Math.max(8, Math.floor(population))
    this.population = pop
    this.elite = Math.max(2, Math.min(pop - 1, Math.round(pop * 0.125)))
    const seed = (Date.now() % 0xffffffff) >>> 0
    const rng = mulberry32(seed)
    this.master = rng
    this.nextSeed = () => rng()
    const sizes = [5, HIDDEN, 1]
    this.pop = Array.from({ length: this.population }, () => MlpPolicy.random(sizes, this.master, 0.5))
    this.lastHud = ''
  }

  startFirstEpoch(): void {
    this.awaitingNextEpoch = false
    this.roundIndex = 0
    this.roundFits = []
    this.roundBestPipes = []
    this.beginParallelRound()
  }

  isAwaitingNextEpoch(): boolean {
    return this.awaitingNextEpoch
  }

  getHud(): string {
    return this.lastHud
  }

  /** Only survivors — crashed agents are omitted from the canvas. */
  getSwarmRender(): SwarmRenderDot[] {
    return this.agents
      .filter((a) => !a.dead)
      .map((a) => ({
        x: a.x,
        y: a.y,
        vy: a.vy,
        r: this.agentRadius,
      }))
  }

  advanceEpoch(): void {
    if (!this.awaitingNextEpoch) return
    this.awaitingNextEpoch = false
    this.roundIndex = 0
    this.roundFits = []
    this.roundBestPipes = []
    this.beginParallelRound()
  }

  dispose() {
    this.refs.pipes.random01 = Math.random
  }

  private layoutAgents() {
    const w = this.refs.getWorldW()
    const n = this.population
    const birdR = this.refs.bird.radius
    /** Keep everyone near the real play lane so shared pipes actually collide (wide spread = “ghost” survivors). */
    const cx = Math.min(w * 0.48, Math.max(w * 0.26, this.refs.bird.x))
    const maxSpan = Math.min(w * 0.34, Math.max(48, (n - 1) * birdR * 2.35))
    const gap = n > 1 ? maxSpan / (n - 1) : 0
    const rFit = gap * 0.44
    this.agentRadius = Math.min(birdR, Math.max(birdR * 0.62, rFit))
    const x0 = cx - maxSpan / 2
    const startY = this.refs.getWorldH() * gameConfig.bird.yFrac
    const pad = this.agentRadius + 3
    this.agents = this.pop.map((policy, i) => {
      const xRaw = x0 + i * gap
      const x = Math.min(w - pad, Math.max(pad, xRaw))
      return {
        policy,
        x,
        y: startY,
        vy: 0,
        dead: false,
        tAlive: 0,
        lastFlapAt: -Infinity,
        roundScore: 0,
      }
    })
  }

  private beginParallelRound() {
    const { pipes } = this.refs
    pipes.reset()
    pipes.random01 = mulberry32(Math.floor(this.nextSeed() * 1e9) >>> 0)
    this.layoutAgents()
    this.roundClock = 0
    this.refreshHud()
  }

  private refreshHud() {
    const alive = this.agents.filter((a) => !a.dead).length
    const epoch = this.gen + 1
    const roundBit =
      PARALLEL_ROUNDS > 1 ? ` · round ${this.roundIndex + 1}/${PARALLEL_ROUNDS}` : ''
    this.lastHud = `Epoch ${epoch}${roundBit} · alive ${alive}/${this.agents.length}`
  }

  step(dtScaled: number) {
    if (this.awaitingNextEpoch) return

    const w = this.refs.getWorldW()
    const h = this.refs.getWorldH()
    const ceiling = this.refs.getCeiling()
    const groundY = this.refs.getGroundY()
    const grav = this.refs.getGravity()
    const flapI = this.refs.getFlapImpulse()
    const maxF = this.refs.getMaxFallSpeed()
    const { pipes } = this.refs
    const pw = pipes.pipeWidth

    this.clock += dtScaled
    this.roundClock += dtScaled
    const nowSec = this.clock

    pipes.step(dtScaled, w, ceiling, groundY)

    for (const a of this.agents) {
      if (a.dead) continue

      a.tAlive += dtScaled

      if (nowSec - a.lastFlapAt >= this.cooldown) {
        const obs = observe({
          worldW: w,
          worldH: h,
          ceiling,
          groundY,
          bird: { x: a.x, y: a.y, vy: a.vy },
          pipes,
        })
        if (a.policy.forward(obs) > 0.5) {
          const targetVy = -flapI
          a.vy = a.vy * (1 - FLAP_BLEND) + targetVy * FLAP_BLEND
          a.lastFlapAt = nowSec
        }
      }

      a.vy += grav * dtScaled
      if (a.vy > maxF) a.vy = maxF
      a.y += a.vy * dtScaled

      const r = this.agentRadius
      if (a.y < ceiling + r) {
        a.y = ceiling + r
        a.vy = 0
      }

      a.roundScore = countPipesPassed(a.x, pw, pipes)

      if (a.y > groundY - r) {
        a.dead = true
        continue
      }

      const rect = { x: a.x - r, y: a.y - r, w: r * 2, h: r * 2 }
      for (const pr of pipes.getRects(ceiling, groundY)) {
        if (rectsOverlap(rect, pr.top) || rectsOverlap(rect, pr.bottom)) {
          a.dead = true
          break
        }
      }
    }

    const aliveN = this.agents.filter((a) => !a.dead).length
    const allDead = this.agents.length > 0 && aliveN === 0
    const timeUp = this.roundClock >= ROUND_MAX_SEC
    if (allDead || timeUp) {
      this.finishParallelRound()
    } else {
      this.refreshHud()
    }
  }

  private finishParallelRound() {
    const fits: number[] = []
    const pipesC: number[] = []
    for (const a of this.agents) {
      const t = Math.max(0.01, a.tAlive)
      fits.push(fitness(a.roundScore, t))
      pipesC.push(a.roundScore)
    }
    this.roundFits.push(fits)
    this.roundBestPipes.push(pipesC)

    this.roundIndex += 1
    if (this.roundIndex < PARALLEL_ROUNDS) {
      this.beginParallelRound()
      return
    }

    for (let i = 0; i < this.population; i++) {
      let fitSum = 0
      let bestP = 0
      for (let r = 0; r < PARALLEL_ROUNDS; r++) {
        fitSum += this.roundFits[r]![i]!
        bestP = Math.max(bestP, this.roundBestPipes[r]![i]!)
      }
      const meanFit = fitSum / PARALLEL_ROUNDS
      this.rows.push({ meanFit, bestPipes: bestP, net: this.pop[i]! })
    }

    this.finishGeneration()
  }

  private finishGeneration() {
    this.rows.sort((a, b) => b.meanFit - a.meanFit)
    const top = this.rows[0]!
    if (top.meanFit > this.bestFitEver) {
      this.bestFitEver = top.meanFit
      this.bestEver = top.net
      if (this.bestEver) this.onBest?.(this.bestEver.toJson())
    }
    const elites = this.rows.slice(0, this.elite).map((r) => r.net)
    const next: MlpPolicy[] = elites.slice()
    while (next.length < this.population) {
      const parent = elites[Math.floor(this.master() * elites.length)]!
      next.push(parent.mutated(this.master, SIGMA, MUT_PROB))
    }
    this.pop = next
    this.rows = []
    this.gen += 1
    this.agents = []
    this.awaitingNextEpoch = true
    this.lastHud = `Epoch ${this.gen} done — Train again for epoch ${this.gen + 1}`
  }
}
