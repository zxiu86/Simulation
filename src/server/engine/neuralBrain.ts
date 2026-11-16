import {
  AGENT_ACTIONS,
  NN_ARCHITECTURE_VERSION,
  type AgentActionType,
  type GeneticTraits,
  type NeuralBrainState,
} from '../../shared/types.ts';
import { computeCanonicalSha256 } from '../persistence/canonicalSerializer.ts';

export const INPUT_SIZE = 24;
export const HIDDEN_SIZE = 20;
export const OUTPUT_SIZE = AGENT_ACTIONS.length; // 14

const FEATURE_LABELS_AR: string[] = [
  'شدة الجوع',
  'شدة العطش',
  'مستوى الصحة',
  'مستوى الطاقة',
  'التعب والأرق',
  'الإصابة والمرض',
  'أثر التسمم',
  'الضغط النفسي',
  'الاحتياج الاجتماعي',
  'وفرة النباتات محلياً',
  'وفرة المياه محلياً',
  'ثقة المعرفة بالمياه',
  'وجود طرائد محلياً',
  'خطر المفترسات والبيئة',
  'وجود أفراد مجاورين',
  'ثقة العلاقات المحيطة',
  'المخزون الشخصي من الغذاء',
  'المخزون الشخصي من الماء',
  'امتلاك أدوات بدائية',
  'وفرة المواد الخام',
  'وجود صغار بحاجة لرعاية',
  'ثقة المعرفة بالنباتات',
  'المعرفة بالتعاون والإشارات',
  'شدة المناخ والموسم',
];

function seededRandom(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function softmax(logits: number[], temperature = 1.0): number[] {
  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(clamp((l - maxLogit) / temperature, -20, 20)));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((e) => e / sum);
}

function computeEntropy(probs: number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 1e-8) {
      h -= p * Math.log(p);
    }
  }
  const maxH = Math.log(probs.length);
  return maxH > 0 ? clamp(h / maxH, 0, 1) : 0;
}

export function createIndependentBrain(
  seedInput: number,
  genetics: GeneticTraits,
): NeuralBrainState {
  const rng = seededRandom(seedInput);
  const scale1 = Math.sqrt(2 / (INPUT_SIZE + HIDDEN_SIZE));
  const scale2 = Math.sqrt(2 / (HIDDEN_SIZE + OUTPUT_SIZE));

  const w1: number[] = [];
  for (let i = 0; i < INPUT_SIZE * HIDDEN_SIZE; i++) {
    w1.push((rng() * 2 - 1) * scale1);
  }
  const b1: number[] = Array.from({ length: HIDDEN_SIZE }, () => (rng() * 2 - 1) * 0.05);

  const wPolicy: number[] = [];
  for (let i = 0; i < HIDDEN_SIZE * OUTPUT_SIZE; i++) {
    wPolicy.push((rng() * 2 - 1) * scale2);
  }
  const bPolicy: number[] = Array.from({ length: OUTPUT_SIZE }, (_, idx) => {
    const base = (rng() * 2 - 1) * 0.08;
    if (idx === 0) return base + (genetics.curiosityBias - 0.5) * 0.25;
    if (idx === 4 || idx === 5 || idx === 6) return base + (genetics.sociabilityBias - 0.5) * 0.25;
    if (idx === 3) return base + (genetics.riskTolerance - 0.5) * 0.2;
    return base;
  });

  const wValue: number[] = Array.from({ length: HIDDEN_SIZE }, () => (rng() * 2 - 1) * scale2);
  const totalParams = w1.length + wPolicy.length;

  return {
    architectureVersion: NN_ARCHITECTURE_VERSION,
    inputSize: INPUT_SIZE,
    hiddenSize: HIDDEN_SIZE,
    outputSize: OUTPUT_SIZE,
    w1,
    b1,
    wPolicy,
    bPolicy,
    wValue,
    bValue: 0,
    fisherImportance: new Array(totalParams).fill(0.01),
    anchorWeights: [...w1, ...wPolicy],
    trainingSteps: 0,
    optimizerStep: 0,
    currentLearningRate: 0.025,
    momentumW1: new Array(w1.length).fill(0),
    momentumWPolicy: new Array(wPolicy.length).fill(0),
    momentumWValue: new Array(wValue.length).fill(0),
    avgLoss: 0,
    avgTdError: 0,
    predictionAccuracy: 0.5,
    policyEntropy: 1,
    lastActionProbabilities: new Array(OUTPUT_SIZE).fill(1 / OUTPUT_SIZE),
  };
}

export interface ForwardResult {
  hidden: number[];
  logits: number[];
  probabilities: number[];
  value: number;
  chosenIndex: number;
  chosenAction: AgentActionType;
  actionReasonAr: string;
}

export function forwardBrain(
  brain: NeuralBrainState,
  inputs: number[],
  explorationTemp = 1.0,
  actionMask?: boolean[],
  rngFn: () => number = Math.random,
): ForwardResult {
  const hidden = new Array<number>(HIDDEN_SIZE);
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    let sum = brain.b1[h];
    const offset = h * INPUT_SIZE;
    for (let i = 0; i < INPUT_SIZE; i++) {
      sum += inputs[i] * brain.w1[offset + i];
    }
    hidden[h] = Math.tanh(sum);
  }

  const logits = new Array<number>(OUTPUT_SIZE);
  for (let o = 0; o < OUTPUT_SIZE; o++) {
    let sum = brain.bPolicy[o];
    const offset = o * HIDDEN_SIZE;
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      sum += hidden[h] * brain.wPolicy[offset + h];
    }
    if (actionMask && !actionMask[o]) {
      sum -= 12;
    }
    logits[o] = sum;
  }

  let value = brain.bValue;
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    value += hidden[h] * brain.wValue[h];
  }

  const probabilities = softmax(logits, explorationTemp);
  brain.lastActionProbabilities = probabilities;
  brain.policyEntropy = computeEntropy(probabilities);

  const r = rngFn();
  let cumulative = 0;
  let chosenIndex = OUTPUT_SIZE - 1;
  for (let o = 0; o < OUTPUT_SIZE; o++) {
    cumulative += probabilities[o];
    if (r <= cumulative) {
      chosenIndex = o;
      break;
    }
  }

  let topFeatureIdx = 0;
  let topFeatureImpact = -1;
  for (let i = 0; i < INPUT_SIZE; i++) {
    const val = Math.abs(inputs[i]);
    if (val > topFeatureImpact) {
      topFeatureImpact = val;
      topFeatureIdx = i;
    }
  }
  const probPct = Math.round(probabilities[chosenIndex] * 100);
  const featureLabel = FEATURE_LABELS_AR[topFeatureIdx] ?? 'المحفز البيئي';
  const actionReasonAr = `استجابةً لـ(${featureLabel}) باحتمال سياسة ${probPct}% وتقييم قيمة ${value.toFixed(2)}`;

  return {
    hidden,
    logits,
    probabilities,
    value,
    chosenIndex,
    chosenAction: AGENT_ACTIONS[chosenIndex],
    actionReasonAr,
  };
}

export interface TrainStepMetrics {
  tdError: number;
  loss: number;
  retentionDelta: number;
}

export function ensureBrainOptimizerBuffers(brain: NeuralBrainState): void {
  if (!Array.isArray(brain.momentumW1) || brain.momentumW1.length !== brain.w1.length) {
    brain.momentumW1 = new Array(brain.w1.length).fill(0);
  }
  if (!Array.isArray(brain.momentumWPolicy) || brain.momentumWPolicy.length !== brain.wPolicy.length) {
    brain.momentumWPolicy = new Array(brain.wPolicy.length).fill(0);
  }
  if (!Array.isArray(brain.momentumWValue) || brain.momentumWValue.length !== brain.wValue.length) {
    brain.momentumWValue = new Array(brain.wValue.length).fill(0);
  }
  if (typeof brain.optimizerStep !== 'number' || !Number.isFinite(brain.optimizerStep)) {
    brain.optimizerStep = brain.trainingSteps || 0;
  }
  if (typeof brain.currentLearningRate !== 'number' || !Number.isFinite(brain.currentLearningRate)) {
    brain.currentLearningRate = 0.025;
  }
}

export function updateBrainActorCritic(
  brain: NeuralBrainState,
  stateVec: number[],
  chosenIndex: number,
  reward: number,
  nextStateVec: number[],
  done: boolean,
  learningRate = 0.025,
  gamma = 0.92,
  ewcLambda = 0.04,
): TrainStepMetrics {
  ensureBrainOptimizerBuffers(brain);

  const momentumBeta = 0.72;
  const scheduledLr = clamp(
    learningRate / (1 + brain.optimizerStep * 0.00025),
    0.004,
    0.05,
  );
  brain.currentLearningRate = Number(scheduledLr.toFixed(6));

  const curHidden = new Array<number>(HIDDEN_SIZE);
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    let sum = brain.b1[h];
    const offset = h * INPUT_SIZE;
    for (let i = 0; i < INPUT_SIZE; i++) {
      sum += stateVec[i] * brain.w1[offset + i];
    }
    curHidden[h] = Math.tanh(sum);
  }

  const curLogits = new Array<number>(OUTPUT_SIZE);
  for (let o = 0; o < OUTPUT_SIZE; o++) {
    let sum = brain.bPolicy[o];
    const offset = o * HIDDEN_SIZE;
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      sum += curHidden[h] * brain.wPolicy[offset + h];
    }
    curLogits[o] = sum;
  }
  const probs = softmax(curLogits, 1.0);

  let curValue = brain.bValue;
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    curValue += curHidden[h] * brain.wValue[h];
  }

  let nextValue = 0;
  if (!done) {
    const nextHidden = new Array<number>(HIDDEN_SIZE);
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      let sum = brain.b1[h];
      const offset = h * INPUT_SIZE;
      for (let i = 0; i < INPUT_SIZE; i++) {
        sum += nextStateVec[i] * brain.w1[offset + i];
      }
      nextHidden[h] = Math.tanh(sum);
    }
    nextValue = brain.bValue;
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      nextValue += nextHidden[h] * brain.wValue[h];
    }
  }

  const targetValue = reward + gamma * nextValue;
  const tdError = clamp(targetValue - curValue, -5, 5);
  const criticLoss = 0.5 * tdError * tdError;
  const policyLoss = -Math.log(Math.max(probs[chosenIndex], 1e-6)) * tdError;
  const totalLoss = criticLoss + Math.abs(policyLoss);

  const dHidden = new Array<number>(HIDDEN_SIZE).fill(0);
  const w1Len = brain.w1.length;

  for (let o = 0; o < OUTPUT_SIZE; o++) {
    const gradLogit = (o === chosenIndex ? 1 : 0) - probs[o];
    const advantageGrad = clamp(gradLogit * tdError, -2, 2);
    brain.bPolicy[o] = clamp(brain.bPolicy[o] + scheduledLr * advantageGrad, -4, 4);
    const offset = o * HIDDEN_SIZE;
    for (let h = 0; h < HIDDEN_SIZE; h++) {
      const pIdx = offset + h;
      const idx = w1Len + pIdx;
      const ewcPenalty =
        ewcLambda *
        brain.fisherImportance[idx] *
        (brain.wPolicy[pIdx] - brain.anchorWeights[idx]);
      const gradW = advantageGrad * curHidden[h] - ewcPenalty;
      dHidden[h] += advantageGrad * brain.wPolicy[pIdx];

      const vel = momentumBeta * brain.momentumWPolicy[pIdx] + (1 - momentumBeta) * gradW;
      brain.momentumWPolicy[pIdx] = vel;
      brain.wPolicy[pIdx] = clamp(brain.wPolicy[pIdx] + scheduledLr * vel, -4, 4);

      brain.fisherImportance[idx] = clamp(
        brain.fisherImportance[idx] * 0.995 + 0.005 * (gradW * gradW),
        0.005,
        2.0,
      );
    }
  }

  brain.bValue = clamp(brain.bValue + scheduledLr * tdError * 0.5, -10, 10);
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    const gradV = tdError * curHidden[h];
    dHidden[h] += tdError * brain.wValue[h] * 0.5;

    const velV = momentumBeta * brain.momentumWValue[h] + (1 - momentumBeta) * gradV;
    brain.momentumWValue[h] = velV;
    brain.wValue[h] = clamp(brain.wValue[h] + scheduledLr * 0.5 * velV, -4, 4);
  }

  let driftSum = 0;
  for (let h = 0; h < HIDDEN_SIZE; h++) {
    const dtanh = (1 - curHidden[h] * curHidden[h]) * clamp(dHidden[h], -2, 2);
    brain.b1[h] = clamp(brain.b1[h] + scheduledLr * 0.5 * dtanh, -3, 3);
    const offset = h * INPUT_SIZE;
    for (let i = 0; i < INPUT_SIZE; i++) {
      const idx = offset + i;
      const anchorDiff = brain.w1[idx] - brain.anchorWeights[idx];
      driftSum += Math.abs(anchorDiff);
      const ewcPenalty = ewcLambda * brain.fisherImportance[idx] * anchorDiff;
      const grad = dtanh * stateVec[i] - ewcPenalty;

      const vel1 = momentumBeta * brain.momentumW1[idx] + (1 - momentumBeta) * grad;
      brain.momentumW1[idx] = vel1;
      brain.w1[idx] = clamp(brain.w1[idx] + scheduledLr * 0.5 * vel1, -3, 3);

      brain.fisherImportance[idx] = clamp(
        brain.fisherImportance[idx] * 0.995 + 0.005 * (grad * grad),
        0.005,
        2.0,
      );
    }
  }

  if (Math.abs(tdError) < 0.35) {
    for (let i = 0; i < brain.w1.length; i++) {
      brain.anchorWeights[i] = brain.anchorWeights[i] * 0.99 + brain.w1[i] * 0.01;
    }
    for (let i = 0; i < brain.wPolicy.length; i++) {
      const idx = w1Len + i;
      brain.anchorWeights[idx] = brain.anchorWeights[idx] * 0.99 + brain.wPolicy[i] * 0.01;
    }
  }

  brain.trainingSteps += 1;
  brain.optimizerStep += 1;
  brain.avgLoss = brain.avgLoss * 0.95 + totalLoss * 0.05;
  brain.avgTdError = brain.avgTdError * 0.95 + Math.abs(tdError) * 0.05;
  const accuratePrediction = Math.abs(tdError) < 0.8 ? 1 : 0;
  brain.predictionAccuracy = brain.predictionAccuracy * 0.97 + accuratePrediction * 0.03;

  const avgDrift = driftSum / Math.max(1, brain.w1.length);
  const retentionDelta = clamp(1 - avgDrift * 0.35, 0, 1);

  return { tdError, loss: totalLoss, retentionDelta };
}

export function computeBrainIntegrityHash(brain: NeuralBrainState): string {
  const { sha256 } = computeCanonicalSha256({
    architectureVersion: brain.architectureVersion,
    inputSize: brain.inputSize,
    hiddenSize: brain.hiddenSize,
    outputSize: brain.outputSize,
    w1: brain.w1.map((n) => Number(n.toFixed(6))),
    b1: brain.b1.map((n) => Number(n.toFixed(6))),
    wPolicy: brain.wPolicy.map((n) => Number(n.toFixed(6))),
    bPolicy: brain.bPolicy.map((n) => Number(n.toFixed(6))),
    wValue: brain.wValue.map((n) => Number(n.toFixed(6))),
    bValue: Number(brain.bValue.toFixed(6)),
  });
  return sha256;
}

export function validateBrainStructure(brain: NeuralBrainState): {
  valid: boolean;
  reason?: string;
} {
  if (!brain || brain.architectureVersion !== NN_ARCHITECTURE_VERSION) {
    return { valid: false, reason: 'إصدار بنية الشبكة العصبية غير متوافق مع المحرك الحالي' };
  }
  if (
    brain.inputSize !== INPUT_SIZE ||
    brain.hiddenSize !== HIDDEN_SIZE ||
    brain.outputSize !== OUTPUT_SIZE
  ) {
    return { valid: false, reason: 'أبعاد الطبقات العصبية غير مطابقة' };
  }
  if (
    !Array.isArray(brain.w1) ||
    brain.w1.length !== INPUT_SIZE * HIDDEN_SIZE ||
    !Array.isArray(brain.b1) ||
    brain.b1.length !== HIDDEN_SIZE ||
    !Array.isArray(brain.wPolicy) ||
    brain.wPolicy.length !== HIDDEN_SIZE * OUTPUT_SIZE ||
    !Array.isArray(brain.bPolicy) ||
    brain.bPolicy.length !== OUTPUT_SIZE ||
    !Array.isArray(brain.wValue) ||
    brain.wValue.length !== HIDDEN_SIZE
  ) {
    return { valid: false, reason: 'مصفوفات الأوزان العصبية ناقصة أو تالفة' };
  }

  const allWeights = [
    ...brain.w1,
    ...brain.b1,
    ...brain.wPolicy,
    ...brain.bPolicy,
    ...brain.wValue,
    brain.bValue,
  ];
  for (const w of allWeights) {
    if (typeof w !== 'number' || !Number.isFinite(w)) {
      return { valid: false, reason: 'تم رصد قيم غير رقمية (NaN/Infinity) في الأوزان العصبية' };
    }
  }
  return { valid: true };
}
