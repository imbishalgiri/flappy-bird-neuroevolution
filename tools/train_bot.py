#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import os
import random
from dataclasses import dataclass
from typing import List, Tuple


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def clamp01(v: float) -> float:
    return clamp(v, 0.0, 1.0)


def sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


@dataclass
class Config:
    world_w: float
    world_h: float
    ground_h: float
    ceiling: float
    bird_x: float
    bird_y_frac: float
    bird_r: float
    gravity: float
    flap_impulse: float
    max_fall_speed: float
    pipe_w: float
    gap_size: float
    pipe_speed: float
    spawn_every: float


def load_config(path: str) -> Config:
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return Config(
        world_w=raw["world"]["w"],
        world_h=raw["world"]["h"],
        ground_h=raw["world"]["groundHeight"],
        ceiling=raw["world"]["ceiling"],
        bird_x=raw["bird"]["x"],
        bird_y_frac=raw["bird"]["yFrac"],
        bird_r=raw["bird"]["radius"],
        gravity=raw["physics"]["gravity"],
        flap_impulse=raw["physics"]["flapImpulse"],
        max_fall_speed=raw["physics"]["maxFallSpeed"],
        pipe_w=raw["pipes"]["pipeWidth"],
        gap_size=raw["pipes"]["gapSize"],
        pipe_speed=raw["pipes"]["speed"],
        spawn_every=raw["pipes"]["spawnEvery"],
    )


class MLP:
    """
    sizes: [in, hidden, out]
    weights: [layer][out][in]
    biases:  [layer][out]
    hidden: tanh, out: sigmoid
    """

    def __init__(self, sizes: List[int], weights: List[List[List[float]]], biases: List[List[float]]):
        self.sizes = sizes
        self.weights = weights
        self.biases = biases

    @staticmethod
    def random(sizes: List[int], rng: random.Random, scale: float = 0.5) -> "MLP":
        weights: List[List[List[float]]] = []
        biases: List[List[float]] = []
        for li in range(len(sizes) - 1):
            ins = sizes[li]
            outs = sizes[li + 1]
            w = [[rng.uniform(-scale, scale) for _ in range(ins)] for _ in range(outs)]
            b = [rng.uniform(-scale, scale) for _ in range(outs)]
            weights.append(w)
            biases.append(b)
        return MLP(sizes, weights, biases)

    def forward(self, x: List[float]) -> float:
        a = x[:]
        for li, (w, b) in enumerate(zip(self.weights, self.biases)):
            out: List[float] = [0.0] * len(w)
            for o in range(len(w)):
                s = b[o]
                row = w[o]
                for i in range(len(row)):
                    s += row[i] * a[i]
                if li == len(self.weights) - 1:
                    out[o] = sigmoid(s)
                else:
                    out[o] = math.tanh(s)
            a = out
        return a[0]

    def mutated(self, rng: random.Random, sigma: float, prob: float) -> "MLP":
        weights = []
        biases = []
        for li, (w, b) in enumerate(zip(self.weights, self.biases)):
            w2 = []
            for row in w:
                row2 = []
                for v in row:
                    if rng.random() < prob:
                        row2.append(v + rng.gauss(0.0, sigma))
                    else:
                        row2.append(v)
                w2.append(row2)
            b2 = []
            for v in b:
                if rng.random() < prob:
                    b2.append(v + rng.gauss(0.0, sigma))
                else:
                    b2.append(v)
            weights.append(w2)
            biases.append(b2)
        return MLP(self.sizes, weights, biases)

    def to_json(self) -> dict:
        return {"kind": "mlp-v1", "sizes": self.sizes, "weights": self.weights, "biases": self.biases}


@dataclass
class Pipe:
    x: float
    gap_y: float
    scored: bool = False


class Sim:
    def __init__(self, cfg: Config, rng: random.Random):
        self.cfg = cfg
        self.rng = rng
        self.reset()

    def reset(self):
        self.mode_done = False
        self.t = 0.0
        self.score = 0
        self.bird_y = self.cfg.world_h * self.cfg.bird_y_frac
        self.bird_vy = 0.0
        self.spawn_timer = 0.0
        self.pipes: List[Pipe] = []

    @property
    def ground_y(self) -> float:
        return self.cfg.world_h - self.cfg.ground_h

    def _spawn_pipe(self):
        margin = 24.0
        min_center = self.cfg.ceiling + margin + self.cfg.gap_size / 2.0
        max_center = self.ground_y - margin - self.cfg.gap_size / 2.0
        gap_center = min_center + (max_center - min_center) * self.rng.random()
        self.pipes.append(Pipe(x=self.cfg.world_w + 40.0, gap_y=gap_center))

    def _get_next_pipe(self) -> Pipe | None:
        for p in self.pipes:
            if p.x + self.cfg.pipe_w >= self.cfg.bird_x:
                return p
        return self.pipes[0] if self.pipes else None

    def observe(self) -> List[float]:
        playable_h = max(1.0, self.ground_y - self.cfg.ceiling)
        bird_y_norm = clamp01((self.bird_y - self.cfg.ceiling) / playable_h)
        bird_vy_norm = clamp(self.bird_vy / 1000.0, -1.5, 1.5) / 1.5

        nxt = self._get_next_pipe()
        if nxt is None:
            dx = 1.0
            gap_y = 0.5
        else:
            dx = (nxt.x - self.cfg.bird_x) / self.cfg.world_w
            gap_y = clamp01((nxt.gap_y - self.cfg.ceiling) / playable_h)
        bird_to_gap = clamp((bird_y_norm - gap_y) * 2.0, -1.0, 1.0)
        return [bird_y_norm, bird_vy_norm, clamp(dx, -0.25, 2.0), gap_y, bird_to_gap]

    def step(self, dt: float, flap: bool):
        if self.mode_done:
            return

        self.t += dt

        # flap
        if flap:
            self.bird_vy = -self.cfg.flap_impulse

        # physics
        self.bird_vy += self.cfg.gravity * dt
        if self.bird_vy > self.cfg.max_fall_speed:
            self.bird_vy = self.cfg.max_fall_speed
        self.bird_y += self.bird_vy * dt

        # pipes
        self.spawn_timer += dt
        while self.spawn_timer >= self.cfg.spawn_every:
            self.spawn_timer -= self.cfg.spawn_every
            self._spawn_pipe()
        for p in self.pipes:
            p.x -= self.cfg.pipe_speed * dt
        keep_from = -self.cfg.pipe_w - 10.0
        while self.pipes and self.pipes[0].x < keep_from:
            self.pipes.pop(0)

        # score
        for p in self.pipes:
            if (not p.scored) and (p.x + self.cfg.pipe_w < self.cfg.bird_x):
                p.scored = True
                self.score += 1

        # collisions: ground/ceiling
        r = self.cfg.bird_r
        if self.bird_y < self.cfg.ceiling + r:
            self.mode_done = True
            return
        if self.bird_y > self.ground_y - r:
            self.mode_done = True
            return

        # collisions: pipes (AABB)
        bird_rect = (self.cfg.bird_x - r, self.bird_y - r, r * 2.0, r * 2.0)
        for p in self.pipes:
            top_h = max(0.0, p.gap_y - self.cfg.gap_size / 2.0 - self.cfg.ceiling)
            bot_y = p.gap_y + self.cfg.gap_size / 2.0
            bot_h = max(0.0, self.ground_y - bot_y)
            if _rects_overlap(bird_rect, (p.x, self.cfg.ceiling, self.cfg.pipe_w, top_h)):
                self.mode_done = True
                return
            if _rects_overlap(bird_rect, (p.x, bot_y, self.cfg.pipe_w, bot_h)):
                self.mode_done = True
                return


def _rects_overlap(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> bool:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return (ax < bx + bw) and (ax + aw > bx) and (ay < by + bh) and (ay + ah > by)


def fitness(score: int, t: float) -> float:
    # prioritize passing pipes, then staying alive a bit longer
    return score * 1000.0 + t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="shared/gameConfig.json")
    ap.add_argument("--out", default="public/bot/best-policy.json")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--generations", type=int, default=60)
    ap.add_argument("--population", type=int, default=240)
    ap.add_argument("--elite", type=int, default=24)
    ap.add_argument("--sigma", type=float, default=0.18)
    ap.add_argument("--mut-prob", type=float, default=0.12)
    ap.add_argument("--episodes", type=int, default=3)
    ap.add_argument("--max-seconds", type=float, default=25.0)
    ap.add_argument("--hidden", type=int, default=6)
    args = ap.parse_args()

    cfg = load_config(args.config)
    rng = random.Random(args.seed)
    sizes = [5, args.hidden, 1]

    pop = [MLP.random(sizes, rng) for _ in range(args.population)]

    best = None
    best_fit = -1e18

    dt = 1.0 / 60.0
    max_steps = int(args.max_seconds / dt)

    for gen in range(args.generations):
        scored: List[Tuple[float, MLP]] = []
        for net in pop:
            fsum = 0.0
            for ep in range(args.episodes):
                sim = Sim(cfg, random.Random(rng.randint(0, 10**9)))
                for _ in range(max_steps):
                    obs = sim.observe()
                    flap = net.forward(obs) > 0.5
                    sim.step(dt, flap)
                    if sim.mode_done:
                        break
                fsum += fitness(sim.score, sim.t)
            scored.append((fsum / max(1, args.episodes), net))

        scored.sort(key=lambda x: x[0], reverse=True)
        top_fit, top_net = scored[0]
        if top_fit > best_fit:
            best_fit = top_fit
            best = top_net

        avg = sum(s for s, _ in scored) / len(scored)
        print(f"gen {gen:03d}  bestFit={top_fit:9.2f}  avgFit={avg:9.2f}")

        elites = [net for _, net in scored[: args.elite]]
        next_pop: List[MLP] = elites[:]
        while len(next_pop) < args.population:
            parent = rng.choice(elites)
            child = parent.mutated(rng, sigma=args.sigma, prob=args.mut_prob)
            next_pop.append(child)
        pop = next_pop

    if best is None:
        raise SystemExit("No best model produced")

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(best.to_json(), f)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()

