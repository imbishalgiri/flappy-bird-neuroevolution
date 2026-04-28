/** Shown on ready + game over overlays */
export const CONTROL_LINES = [
  '1) Press Space to jump',
  '2) Press B to go to bot mode',
  '3) Press Esc to quit to title',
] as const

export function controlsBlock(): string {
  return CONTROL_LINES.join('\n')
}
