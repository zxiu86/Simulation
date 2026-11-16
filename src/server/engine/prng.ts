/**
 * Deterministic Seedable PRNG (Mulberry32) with serializable internal state.
 * Enables Exact Checkpoint Resume across separate process runs.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number = 0x9e3779b9) {
    this.state = (seed >>> 0) || 1;
  }

  public next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) return 0;
    return Math.floor(this.next() * maxExclusive);
  }

  public getState(): number {
    return this.state >>> 0;
  }

  public setState(state: number): void {
    this.state = (state >>> 0) || 1;
  }
}
