export type InputHandlers = {
  flap: () => void
  restart: () => void
  toggleBot?: () => void
  /** Exit training (when active). */
  exitTrain?: () => void
  /** Advance to next training epoch when paused between epochs. */
  nextTrainEpoch?: () => void
  quit?: () => void
}

/** Space only for flap; no pointer/click. Esc / R / B on keyboard. */
export function installInput(handlers: InputHandlers) {
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.preventDefault()
      handlers.quit?.()
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      handlers.flap()
      return
    }
    if (e.code === 'KeyR') {
      handlers.restart()
      return
    }
    if (e.code === 'KeyB') {
      handlers.toggleBot?.()
      return
    }
    if (e.code === 'KeyT') {
      handlers.exitTrain?.()
      return
    }
    if (e.code === 'KeyY') {
      handlers.nextTrainEpoch?.()
    }
  }

  window.addEventListener('keydown', onKeyDown)

  return () => {
    window.removeEventListener('keydown', onKeyDown)
  }
}
