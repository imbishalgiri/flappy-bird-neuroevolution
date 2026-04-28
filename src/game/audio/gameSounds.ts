import failureUrl from '../../assets/failure.mp3'
import successUrl from '../../assets/success.mp3'
import swooshUrl from '../../assets/swoosh.mp3'

function makeAudio(src: string): HTMLAudioElement {
  const a = new Audio(src)
  a.preload = 'auto'
  return a
}

function playOneShot(a: HTMLAudioElement) {
  try {
    a.currentTime = 0
    void a.play().catch(() => {})
  } catch {
    // ignore
  }
}

export class GameSounds {
  private readonly swoosh = makeAudio(swooshUrl)
  private readonly success = makeAudio(successUrl)
  private readonly failure = makeAudio(failureUrl)

  playSwoosh() {
    playOneShot(this.swoosh)
  }

  playSuccess() {
    playOneShot(this.success)
  }

  playFailure() {
    playOneShot(this.failure)
  }
}
