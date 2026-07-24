/**
 * 遗传算法 (Genetic Algorithm)
 *
 * 用于参数优化和特征选择。
 * 选择：锦标赛选择
 * 交叉：单点/均匀交叉
 * 变异：高斯变异
 * 精英保留
 */
import { gaussianSample, clamp, EPS } from "./math";

export interface GAConfig {
  populationSize?: number;
  numGenerations?: number;
  crossoverRate?: number;
  mutationRate?: number;
  eliteSize?: number;
  tournamentSize?: number;
  bounds: Array<{ min: number; max: number }>;
  fitness: (individual: number[]) => number;
  seed?: number;
  verbose?: boolean;
}

export interface GAResult {
  bestIndividual: number[];
  bestFitness: number;
  history: { generation: number; best: number; mean: number; std: number }[];
  totalGenerations: number;
}

export class GeneticAlgorithm {
  private config: Required<Omit<GAConfig, "bounds" | "fitness">> & {
    bounds: Array<{ min: number; max: number }>;
    fitness: (individual: number[]) => number;
  };
  private rng: () => number;

  constructor(config: GAConfig) {
    this.config = {
      populationSize: config.populationSize ?? 50,
      numGenerations: config.numGenerations ?? 30,
      crossoverRate: config.crossoverRate ?? 0.8,
      mutationRate: config.mutationRate ?? 0.1,
      eliteSize: config.eliteSize ?? 2,
      tournamentSize: config.tournamentSize ?? 3,
      bounds: config.bounds,
      fitness: config.fitness,
      seed: config.seed ?? Date.now(),
      verbose: config.verbose ?? false,
    };
    let seed = this.config.seed;
    this.rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }

  private randomIndividual(): number[] {
    return this.config.bounds.map((b) => b.min + this.rng() * (b.max - b.min));
  }

  private initPopulation(): number[][] {
    return Array.from({ length: this.config.populationSize }, () => this.randomIndividual());
  }

  private evaluate(population: number[][]): number[] {
    return population.map((ind) => this.config.fitness(ind));
  }

  /** 锦标赛选择 */
  private tournamentSelect(population: number[][], fitnesses: number[]): number[] {
    const idx = Math.floor(this.rng() * population.length);
    let best = population[idx];
    let bestFit = fitnesses[idx];
    for (let i = 1; i < this.config.tournamentSize; i++) {
      const k = Math.floor(this.rng() * population.length);
      if (fitnesses[k] > bestFit) {
        best = population[k];
        bestFit = fitnesses[k];
      }
    }
    return [...best];
  }

  /** 均匀交叉 */
  private crossover(p1: number[], p2: number[]): number[] {
    if (this.rng() > this.config.crossoverRate) return [...p1];
    return p1.map((v, i) => (this.rng() < 0.5 ? v : p2[i]));
  }

  /** 高斯变异 */
  private mutate(ind: number[]): number[] {
    return ind.map((v, i) => {
      if (this.rng() < this.config.mutationRate) {
        const range = this.config.bounds[i].max - this.config.bounds[i].min;
        const noise = gaussianSample(0, range * 0.1);
        return clamp(v + noise, this.config.bounds[i].min, this.config.bounds[i].max);
      }
      return v;
    });
  }

  run(): GAResult {
    let population = this.initPopulation();
    const history: { generation: number; best: number; mean: number; std: number }[] = [];

    for (let gen = 0; gen < this.config.numGenerations; gen++) {
      const fitnesses = this.evaluate(population);
      const mean = fitnesses.reduce((a, b) => a + b, 0) / fitnesses.length;
      const std = Math.sqrt(fitnesses.reduce((s, f) => s + (f - mean) ** 2, 0) / fitnesses.length);
      const best = Math.max(...fitnesses);
      history.push({ generation: gen, best, mean, std });

      if (this.config.verbose && gen % 5 === 0) {
        console.log(`[GA] gen ${gen}, best=${best.toFixed(4)}, mean=${mean.toFixed(4)}`);
      }

      // 精英保留
      const sorted = population
        .map((ind, i) => ({ ind, fit: fitnesses[i] }))
        .sort((a, b) => b.fit - a.fit);
      const newPop: number[][] = sorted.slice(0, this.config.eliteSize).map((s) => [...s.ind]);

      // 生成新种群
      while (newPop.length < this.config.populationSize) {
        const p1 = this.tournamentSelect(population, fitnesses);
        const p2 = this.tournamentSelect(population, fitnesses);
        const child = this.crossover(p1, p2);
        newPop.push(this.mutate(child));
      }
      population = newPop;
    }

    // 最终评估
    const finalFit = this.evaluate(population);
    const bestIdx = finalFit.indexOf(Math.max(...finalFit));
    return {
      bestIndividual: population[bestIdx],
      bestFitness: finalFit[bestIdx],
      history,
      totalGenerations: this.config.numGenerations,
    };
  }
}
