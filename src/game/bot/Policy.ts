export type MlpPolicyJson = {
  kind: 'mlp-v1'
  sizes: number[]
  weights: number[][][] // [layer][out][in]
  biases: number[][] // [layer][out]
}

export class MlpPolicy {
  private readonly sizes: number[]
  private readonly weights: number[][][]
  private readonly biases: number[][]

  constructor(json: MlpPolicyJson) {
    this.sizes = json.sizes
    this.weights = json.weights
    this.biases = json.biases
  }

  forward(input: number[]): number {
    if (input.length !== this.sizes[0]) throw new Error(`Expected input size ${this.sizes[0]}`)
    let a = input.slice()
    for (let layer = 0; layer < this.weights.length; layer++) {
      const w = this.weights[layer]
      const b = this.biases[layer]
      const out: number[] = new Array(w.length)
      for (let o = 0; o < w.length; o++) {
        let sum = b[o] ?? 0
        const row = w[o]
        for (let i = 0; i < row.length; i++) sum += row[i] * a[i]
        out[o] = layer === this.weights.length - 1 ? sigmoid(sum) : Math.tanh(sum)
      }
      a = out
    }
    return a[0] ?? 0
  }
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-x))
}

