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

  toJson(): MlpPolicyJson {
    return {
      kind: 'mlp-v1',
      sizes: [...this.sizes],
      weights: this.weights.map((layer) => layer.map((row) => [...row])),
      biases: this.biases.map((b) => [...b]),
    }
  }

  static random(sizes: number[], random01: () => number, scale = 0.5): MlpPolicy {
    const u = () => (random01() * 2 - 1) * scale
    const weights: number[][][] = []
    const biases: number[][] = []
    for (let li = 0; li < sizes.length - 1; li++) {
      const ins = sizes[li]!
      const outs = sizes[li + 1]!
      const w = Array.from({ length: outs }, () => Array.from({ length: ins }, () => u()))
      const b = Array.from({ length: outs }, () => u())
      weights.push(w)
      biases.push(b)
    }
    return new MlpPolicy({ kind: 'mlp-v1', sizes: [...sizes], weights, biases })
  }

  mutated(random01: () => number, sigma: number, prob: number): MlpPolicy {
    const weights = this.weights.map((layer) =>
      layer.map((row) =>
        row.map((v) => (random01() < prob ? v + gaussian01(random01) * sigma : v)),
      ),
    )
    const biases = this.biases.map((layer) =>
      layer.map((v) => (random01() < prob ? v + gaussian01(random01) * sigma : v)),
    )
    return new MlpPolicy({
      kind: 'mlp-v1',
      sizes: [...this.sizes],
      weights,
      biases,
    })
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

function gaussian01(random01: () => number): number {
  let u = 0
  let v = 0
  let s = 0
  do {
    u = random01() * 2 - 1
    v = random01() * 2 - 1
    s = u * u + v * v
  } while (s >= 1 || s === 0)
  return u * Math.sqrt((-2 * Math.log(s)) / s)
}
