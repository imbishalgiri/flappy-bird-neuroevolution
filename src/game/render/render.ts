import type { GameMode } from '../state'
import type { Bird } from '../entities/Bird'
import type { PipeSystem } from '../entities/PipeSystem'
import { controlsBlock } from './copy'

export type RenderModel = {
  mode: GameMode
  worldW: number
  worldH: number
  ceiling: number
  groundY: number
  score: number
  bestScore: number
  botEnabled: boolean
  bird: Bird
  pipes: PipeSystem
}

export function render(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.clearRect(0, 0, m.worldW, m.worldH)

  drawBackground(ctx, m.worldW, m.worldH)
  drawPipes(ctx, m)
  drawGround(ctx, m.worldW, m.groundY, m.worldH)
  drawBird(ctx, m.bird, m.botEnabled)
  if (m.botEnabled) drawBotLabel(ctx, m.bird)
  drawHud(ctx, m)
}

function drawBotLabel(ctx: CanvasRenderingContext2D, bird: Bird) {
  const r = bird.radius
  const fontPx = Math.max(11, Math.min(18, r * 0.42))
  const y = bird.y + r * 1.38

  ctx.save()
  ctx.font = `800 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.lineWidth = Math.max(2, fontPx * 0.18)
  ctx.strokeStyle = '#ffffff'
  ctx.strokeText('BOT', bird.x, y)
  ctx.fillStyle = '#000000'
  ctx.fillText('BOT', bird.x, y)
  ctx.restore()
}

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#b8b8b8')
  g.addColorStop(1, '#f0f0f0')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  ctx.globalAlpha = 0.22
  ctx.fillStyle = '#888888'
  for (let i = 0; i < 12; i++) {
    const x = (i * 97) % w
    const y = ((i * 53) % h) * 0.45 + 25
    ctx.beginPath()
    ctx.ellipse(x, y, 38, 18, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

function drawGround(ctx: CanvasRenderingContext2D, w: number, groundY: number, worldH: number) {
  ctx.fillStyle = '#0a0a0a'
  ctx.fillRect(0, groundY, w, worldH - groundY)

  ctx.globalAlpha = 0.35
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, groundY, w, 3)
  ctx.globalAlpha = 1
}

function drawPipes(ctx: CanvasRenderingContext2D, m: RenderModel) {
  const rects = m.pipes.getRects(m.ceiling, m.groundY)
  for (const r of rects) {
    drawPipeRect(ctx, r.top)
    drawPipeRect(ctx, r.bottom)
  }
}

function drawPipeRect(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }) {
  if (r.h <= 0) return
  ctx.fillStyle = '#000000'
  ctx.fillRect(r.x, r.y, r.w, r.h)

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 2
  ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2)

  ctx.fillStyle = '#2a2a2a'
  ctx.fillRect(r.x + 5, r.y + 5, Math.max(0, r.w - 10), Math.max(0, r.h - 10))
}

function drawBird(ctx: CanvasRenderingContext2D, bird: Bird, botEnabled: boolean) {
  if (botEnabled) {
    drawBotAlien(ctx, bird)
    return
  }
  drawBirdVector(ctx, bird)
}

/** Grey-alien silhouette for bot mode (B&W, matches collision circle ~ radius). */
function drawBotAlien(ctx: CanvasRenderingContext2D, bird: Bird) {
  ctx.save()
  const angle = clamp(bird.vy / 850, -0.6, 0.9)
  ctx.translate(bird.x, bird.y)
  ctx.rotate(angle)

  const r = bird.radius
  const stroke = Math.max(1.5, r * 0.1)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Head (oversized ellipsoid)
  ctx.fillStyle = '#d8d8d8'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = stroke
  ctx.beginPath()
  ctx.ellipse(0, -r * 0.12, r * 0.88, r * 1.02, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Eyes (classic big black ovals)
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.ellipse(-r * 0.32, -r * 0.18, r * 0.28, r * 0.38, 0.1, 0, Math.PI * 2)
  ctx.ellipse(r * 0.32, -r * 0.18, r * 0.28, r * 0.38, -0.1, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(-r * 0.22, -r * 0.28, r * 0.07, 0, Math.PI * 2)
  ctx.arc(r * 0.42, -r * 0.28, r * 0.07, 0, Math.PI * 2)
  ctx.fill()

  // Small mouth / slit
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = stroke * 0.55
  ctx.beginPath()
  ctx.moveTo(-r * 0.18, r * 0.22)
  ctx.quadraticCurveTo(0, r * 0.34, r * 0.18, r * 0.22)
  ctx.stroke()

  // Thin neck + small body
  ctx.fillStyle = '#c4c4c4'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = stroke
  ctx.beginPath()
  ctx.ellipse(0, r * 0.62, r * 0.38, r * 0.48, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Tiny arms
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = stroke * 0.65
  ctx.beginPath()
  ctx.moveTo(-r * 0.55, r * 0.38)
  ctx.quadraticCurveTo(-r * 1.05, r * 0.5, -r * 0.75, r * 0.72)
  ctx.moveTo(r * 0.55, r * 0.38)
  ctx.quadraticCurveTo(r * 1.05, r * 0.5, r * 0.75, r * 0.72)
  ctx.stroke()

  ctx.restore()
}

function drawBirdVector(ctx: CanvasRenderingContext2D, bird: Bird) {
  ctx.save()
  const angle = clamp(bird.vy / 850, -0.6, 0.9)
  ctx.translate(bird.x, bird.y)
  ctx.rotate(angle)

  const r = bird.radius
  const stroke = Math.max(1.5, r * 0.11)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Wing (behind body)
  ctx.fillStyle = '#d0d0d0'
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = stroke
  ctx.beginPath()
  ctx.ellipse(-r * 0.38, r * 0.12, r * 0.42, r * 0.26, -0.35, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Body — horizontal capsule facing right
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(0, 0, r * 0.92, r * 0.72, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()

  // Belly shading
  ctx.fillStyle = 'rgba(0,0,0,0.08)'
  ctx.beginPath()
  ctx.ellipse(-r * 0.08, r * 0.22, r * 0.55, r * 0.32, 0.15, 0, Math.PI * 2)
  ctx.fill()

  // Beak
  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.moveTo(r * 0.72, -r * 0.12)
  ctx.lineTo(r * 1.38, 0)
  ctx.lineTo(r * 0.72, r * 0.12)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = Math.max(1, stroke * 0.45)
  ctx.stroke()

  // Eye — white ring + black pupil
  const ex = r * 0.38
  const ey = -r * 0.22
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(ex, ey, r * 0.28, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = stroke * 0.75
  ctx.stroke()

  ctx.fillStyle = '#000000'
  ctx.beginPath()
  ctx.arc(ex + r * 0.06, ey - r * 0.02, r * 0.1, 0, Math.PI * 2)
  ctx.fill()

  // Tail feather hint
  ctx.strokeStyle = '#000000'
  ctx.lineWidth = stroke * 0.65
  ctx.beginPath()
  ctx.moveTo(-r * 0.85, -r * 0.08)
  ctx.quadraticCurveTo(-r * 1.15, 0, -r * 0.82, r * 0.12)
  ctx.stroke()

  ctx.restore()
}

function drawHud(ctx: CanvasRenderingContext2D, m: RenderModel) {
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  ctx.font = '700 34px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  ctx.lineWidth = 4
  ctx.strokeStyle = '#ffffff'
  ctx.strokeText(String(m.score), m.worldW / 2, 18)
  ctx.fillStyle = '#000000'
  ctx.fillText(String(m.score), m.worldW / 2, 18)

  if (m.mode === 'ready') {
    const lines = [
      ...controlsBlock().split('\n'),
      '',
      'Press Space to start',
    ]
    overlay(ctx, m, 'Flappy Bird', lines)
  } else if (m.mode === 'gameOver') {
    const lines = [
      `Score: ${m.score}  Best: ${m.bestScore}`,
      '',
      ...controlsBlock().split('\n'),
      '',
      'Press Space to restart',
    ]
    overlay(ctx, m, 'Game Over', lines)
  }
}

function overlay(ctx: CanvasRenderingContext2D, m: RenderModel, title: string, bodyLines: string[]) {
  const lineH = 18
  const titleSize = Math.min(28, m.worldW * 0.07)
  const bodySize = Math.min(15, m.worldW * 0.038)
  const boxW = Math.min(320, m.worldW - 24)
  const boxH = 52 + titleSize + 8 + bodyLines.length * lineH + 18
  const cx = m.worldW / 2
  const cy = m.worldH / 2
  const x = cx - boxW / 2
  const y = cy - boxH / 2
  const rr = 14

  ctx.save()
  ctx.globalAlpha = 0.45
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, m.worldW, m.worldH)
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 3
  roundRect(ctx, x, y, boxW, boxH, rr)
  ctx.stroke()

  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x, y, boxW, boxH, rr)
  ctx.fill()

  ctx.fillStyle = '#000000'
  ctx.font = `800 ${titleSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
  ctx.fillText(title, cx, y + 28 + titleSize / 2)

  ctx.font = `600 ${bodySize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`
  let ly = y + 48 + titleSize + lineH / 2
  for (const line of bodyLines) {
    if (line === '') {
      ly += lineH * 0.35
      continue
    }
    ctx.fillText(line, cx, ly)
    ly += lineH
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

