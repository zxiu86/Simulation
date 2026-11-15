import {
  GRID_SIZE,
  type AgentIdentity,
  type AgentState,
  type GeneticTraits,
  type PersonalityTraits,
} from '../../shared/types.ts';
import { createIndependentBrain } from './neuralBrain.ts';

const SYLLABLES_A = ['آ', 'با', 'تا', 'دا', 'را', 'زا', 'سا', 'كا', 'لا', 'ما', 'نا', 'ها', 'وا', 'يا'];
const SYLLABLES_B = ['رم', 'دن', 'سل', 'كر', 'من', 'نر', 'هد', 'ور', 'يم', 'شد', 'فل', 'قر'];

function generateUniqueName(index: number): string {
  const a = SYLLABLES_A[index % SYLLABLES_A.length];
  const b = SYLLABLES_B[Math.floor(index / SYLLABLES_A.length) % SYLLABLES_B.length];
  return `${a}${b}-${index + 1}`;
}

function clamp01(v: number): number {
  return Math.max(0.05, Math.min(0.95, v));
}

export function randomGenetics(parentA?: GeneticTraits, parentB?: GeneticTraits): GeneticTraits {
  const mutate = (val: number) => clamp01(val + (Math.random() - 0.5) * 0.16);
  if (parentA && parentB) {
    return {
      metabolismRate: mutate((parentA.metabolismRate + parentB.metabolismRate) / 2),
      curiosityBias: mutate((parentA.curiosityBias + parentB.curiosityBias) / 2),
      sociabilityBias: mutate((parentA.sociabilityBias + parentB.sociabilityBias) / 2),
      riskTolerance: mutate((parentA.riskTolerance + parentB.riskTolerance) / 2),
      learningRateGene: mutate((parentA.learningRateGene + parentB.learningRateGene) / 2),
    };
  }
  return {
    metabolismRate: clamp01(0.35 + Math.random() * 0.3),
    curiosityBias: clamp01(0.2 + Math.random() * 0.6),
    sociabilityBias: clamp01(0.2 + Math.random() * 0.6),
    riskTolerance: clamp01(0.2 + Math.random() * 0.6),
    learningRateGene: clamp01(0.35 + Math.random() * 0.35),
  };
}

export function randomPersonality(genetics: GeneticTraits): PersonalityTraits {
  return {
    boldness: clamp01(genetics.riskTolerance * 0.7 + Math.random() * 0.3),
    empathy: clamp01(genetics.sociabilityBias * 0.7 + Math.random() * 0.3),
    diligence: clamp01(0.25 + Math.random() * 0.6),
    caution: clamp01((1 - genetics.riskTolerance) * 0.65 + Math.random() * 0.35),
    gregariousness: clamp01(genetics.sociabilityBias * 0.65 + Math.random() * 0.35),
  };
}

export function createAgent(params: {
  serialIndex: number;
  generation: number;
  birthTick: number;
  originType: AgentIdentity['originType'];
  ageStage?: 'child' | 'adult' | 'elder';
  ageTicks?: number;
  sectorX?: number;
  sectorY?: number;
  parentA?: AgentState;
  parentB?: AgentState;
  customName?: string;
}): AgentState {
  const genetics = randomGenetics(
    params.parentA?.identity.geneticTraits,
    params.parentB?.identity.geneticTraits,
  );
  const personality = randomPersonality(genetics);
  const id = `ind_${params.generation}_${params.serialIndex}_${Math.floor(Math.random() * 10000)}`;
  const seed = Math.floor(Math.random() * 1_000_000_000) + params.serialIndex * 7919 + params.birthTick * 131;

  const lineageIds: string[] = [];
  if (params.parentA) lineageIds.push(params.parentA.identity.id);
  if (params.parentB) lineageIds.push(params.parentB.identity.id);

  const stage = params.ageStage ?? (params.originType === 'natural_birth' ? 'child' : 'adult');
  const ageTicks = params.ageTicks ?? (stage === 'child' ? 0 : 120 + Math.floor(Math.random() * 140));

  return {
    identity: {
      id,
      name: params.customName ?? generateUniqueName(params.serialIndex),
      birthTick: params.birthTick,
      originType: params.originType,
      lineageIds,
      geneticTraits: genetics,
    },
    generation: params.generation,
    ageTicks,
    ageStage: stage,
    sex: params.serialIndex % 2 === 0 ? 'female' : 'male',
    alive: true,
    sectorX: params.sectorX ?? Math.floor(Math.random() * GRID_SIZE),
    sectorY: params.sectorY ?? Math.floor(Math.random() * GRID_SIZE),
    physical: {
      hunger: 18 + Math.random() * 18,
      thirst: 18 + Math.random() * 18,
      health: 92 + Math.random() * 8,
      energy: 82 + Math.random() * 18,
      fatigue: Math.random() * 12,
      injury: 0,
      illness: 0,
      poison: 0,
      poisonTimer: 0,
      pendingPoisonDose: 0,
      sleepNeed: Math.random() * 15,
    },
    psychological: {
      stress: 10 + Math.random() * 15,
      morale: 68 + Math.random() * 20,
      safetyFeeling: 65 + Math.random() * 20,
      loneliness: 15 + Math.random() * 20,
    },
    needs: {
      survivalPriority: 0.4,
      socialPriority: 0.3,
      curiosityPriority: genetics.curiosityBias,
      reproductionReadiness: stage === 'adult' ? 0.5 : 0,
    },
    personality,
    skills: {
      foraging: 0,
      waterFinding: 0,
      hunting: 0,
      crafting: 0,
      healing: 0,
      cooperation: 0,
      signaling: 0,
      shelterBuilding: 0,
      preservation: 0,
      protoAgriculture: 0,
    },
    knowledgeIds: [],
    vocabulary: {},
    episodicMemory: [],
    longTermMemory: {
      knownSafeEntities: [],
      knownDangerousEntities: [],
      preferredSectors: [],
      consolidatedLessons: 0,
      recentActionCounts: {},
    },
    relationships: {},
    inventory: {
      food: 0,
      water: 0,
      tools: 0,
      materials: 0,
    },
    brain: createIndependentBrain(seed, genetics),
    rlStats: {
      totalDecisions: 0,
      totalReward: 0,
      shortTermRewardSum: 0,
      longTermRewardSum: 0,
      successfulActions: 0,
      failedActions: 0,
      rewardHackingFlags: 0,
      replayUpdates: 0,
      retentionScore: 1.0,
      forgettingRate: 0.0,
    },
    offspringCount: 0,
    parentIds: lineageIds,
    gestationCooldown: 0,
  };
}
