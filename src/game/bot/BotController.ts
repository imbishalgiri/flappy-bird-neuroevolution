import { gameConfig } from '../config'
import { MlpPolicy, type MlpPolicyJson } from './Policy'
import { observe } from './observe'
import type { Bird } from '../entities/Bird'
import type { PipeSystem } from '../entities/PipeSystem'

const POLICY_STORAGE_KEY = 'flappy-bot-policy-v1'

export class BotController {
  enabled = false
  private policy: MlpPolicy | null = null
  private lastFlapAt = -Infinity

  get isReady() {
    return this.policy !== null
  }

  async ensureLoaded() {
    if (this.policy) return
    try {
      const raw = localStorage.getItem(POLICY_STORAGE_KEY)
      if (raw) {
        const json = JSON.parse(raw) as MlpPolicyJson
        if (json.kind === 'mlp-v1') {
          this.policy = new MlpPolicy(json)
          return
        }
      }
    } catch {
      // ignore
    }
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}bot/best-policy.json`, { cache: 'no-store' })
      if (!res.ok) return
      const json = (await res.json()) as MlpPolicyJson
      if (json.kind !== 'mlp-v1') return
      this.policy = new MlpPolicy(json)
    } catch {
      // ignore; bot just won't be available
    }
  }

  setPolicy(json: MlpPolicyJson) {
    if (json.kind !== 'mlp-v1') return
    this.policy = new MlpPolicy(json)
    try {
      localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(json))
    } catch {
      // private mode / quota
    }
  }

  toggle() {
    this.enabled = !this.enabled
    // if enabling, attempt to load asynchronously
    if (this.enabled) void this.ensureLoaded()
  }

  /** Turn bot off (e.g. when quitting to title). */
  disable() {
    this.enabled = false
  }

  step(opts: {
    nowSec: number
    worldW: number
    worldH: number
    ceiling: number
    groundY: number
    bird: Bird
    pipes: PipeSystem
  }): boolean {
    if (!this.enabled || !this.policy) return false
    if (opts.nowSec - this.lastFlapAt < gameConfig.bot.flapCooldownSec) return false

    const obs = observe(opts)
    const p = this.policy.forward(obs)
    if (p > 0.5) {
      this.lastFlapAt = opts.nowSec
      return true
    }
    return false
  }
}
