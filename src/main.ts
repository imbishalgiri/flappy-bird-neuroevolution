import './style.css'
import { Game } from './game/Game'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app')

app.innerHTML = `
  <div class="stage">
    <canvas id="game" aria-label="Flappy Bird canvas" role="img"></canvas>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('Missing #game canvas')

const game = new Game(canvas)
game.start()
