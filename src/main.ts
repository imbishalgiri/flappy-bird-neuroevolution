import './style.css'
import { Game } from './game/Game'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('Missing #app')

app.innerHTML = `
  <div class="stage">
    <canvas id="game" aria-label="Flappy Bird canvas" role="img"></canvas>
    <div class="train-actions" id="train-actions" aria-label="Bot training controls">
      <button type="button" class="train-actions__btn train-actions__btn--primary" id="train-start-epoch">
        Start epoch
      </button>
      <button type="button" class="train-actions__btn" id="train-again" disabled>
        Train again
      </button>
    </div>
  </div>
`

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('Missing #game canvas')

const game = new Game(canvas)

const trainRow = document.querySelector<HTMLDivElement>('#train-actions')!
const trainStart = document.querySelector<HTMLButtonElement>('#train-start-epoch')!
const trainAgain = document.querySelector<HTMLButtonElement>('#train-again')!

trainStart.addEventListener('click', () => {
  game.startEpochTraining()
})

trainAgain.addEventListener('click', () => {
  game.advanceTrainingEpoch()
})

const syncTrainActions = () => {
  const mode = game.getMode()
  if (mode === 'ready') {
    trainRow.hidden = false
    trainStart.disabled = false
    trainAgain.disabled = true
  } else if (mode === 'training') {
    trainRow.hidden = false
    trainStart.disabled = true
    trainAgain.disabled = !game.isAwaitingTrainingEpoch()
  } else {
    trainRow.hidden = true
  }
  requestAnimationFrame(syncTrainActions)
}
requestAnimationFrame(syncTrainActions)

game.start()
