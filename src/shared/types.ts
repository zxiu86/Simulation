export const SCHEMA_VERSION = '1.0.0';
export const ENGINE_VERSION = '1.0.0';
export const NN_ARCHITECTURE_VERSION = 'actor-critic-mlp-24-20-14-v1';
export const WORLD_AREA_KM2 = 5.0;
export const GRID_SIZE = 10; // 10 x 10 = 100 sectors, each 0.05 km^2 (223.6m x 223.6m)
export const INITIAL_POPULATION = 100;

export const AGENT_ACTIONS = [
  'explore',
  'forage_plant',
  'drink_water',
  'hunt_prey',
  'observe_peer',
  'cooperate_task',
  'share_resource',
  'rest_sleep',
  'craft_attempt',
  'emit_signal',
  'tend_child',
  'reconcile_or_bond',
  'treat_ailment',
  'move_sector',
] as const;

export type AgentActionType = (typeof AGENT_ACTIONS)[number];

export type BiomeType =
  | 'riverbank'
  | 'savanna'
  | 'forest'
  | 'rocky_highland'
  | 'marsh'
  | 'arid_steppe';

export type CertaintyStatus = 'unconfirmed' | 'confirmed' | 'disproven';

export type ExtinctionRiskLevel =
  | 'stable'
  | 'decline'
  | 'critical'
  | 'near_extinction'
  | 'total_extinction';

export type RecoveryPolicyMode =
  | 'spawn_new_generation'
  | 'revive_preserved_individuals';

export type KnowledgeCategory =
  | 'food_plant'
  | 'water_source'
  | 'animal'
  | 'hunting_method'
  | 'tool'
  | 'cooperation'
  | 'signal_vocabulary'
  | 'preservation'
  | 'shelter'
  | 'health_remedy'
  | 'proto_agriculture';

export interface PlantSpecies {
  id: string;
  localName: string;
  nutrition: number;
  toxicity: number;
  medicinalValue: number;
  delayedOnsetTicks: number;
}

export interface WaterSource {
  id: string;
  kind: 'river' | 'spring' | 'pond' | 'stagnant_pool';
  volume: number;
  maxVolume: number;
  regenerationRate: number;
  contaminationRisk: number;
}

export interface AnimalEntity {
  id: string;
  speciesKey: string;
  temperament: 'docile' | 'skittish' | 'predator';
  count: number;
  maxCount: number;
  meatYield: number;
  dangerLevel: number;
  difficulty: number;
}

export interface WorldSector {
  x: number;
  y: number;
  key: string;
  biome: BiomeType;
  plantSupply: number;
  maxPlantSupply: number;
  plantSpeciesIds: string[];
  waterSource: WaterSource | null;
  animals: AnimalEntity[];
  stoneSupply: number;
  woodSupply: number;
  fiberSupply: number;
  hazardLevel: number;
  sheltersBuilt: number;
  foodCaches: number;
  waterCaches: number;
  plantedPlots: number;
}

export interface WorldState {
  runId: string;
  tick: number;
  worldDays: number;
  areaKm2: number;
  season: 'wet' | 'temperate' | 'dry' | 'harsh';
  temperatureC: number;
  rainfall: number;
  climateStress: number;
  sectors: WorldSector[];
  plantCatalog: Record<string, PlantSpecies>;
}

export interface PhysicalState {
  hunger: number;
  thirst: number;
  health: number;
  energy: number;
  fatigue: number;
  injury: number;
  illness: number;
  poison: number;
  poisonTimer: number;
  pendingPoisonDose: number;
  sleepNeed: number;
}

export interface PsychologicalState {
  stress: number;
  morale: number;
  safetyFeeling: number;
  loneliness: number;
}

export interface AgentNeeds {
  survivalPriority: number;
  socialPriority: number;
  curiosityPriority: number;
  reproductionReadiness: number;
}

export interface PersonalityTraits {
  boldness: number;
  empathy: number;
  diligence: number;
  caution: number;
  gregariousness: number;
}

export interface GeneticTraits {
  metabolismRate: number;
  curiosityBias: number;
  sociabilityBias: number;
  riskTolerance: number;
  learningRateGene: number;
}

export interface AgentSkills {
  foraging: number;
  waterFinding: number;
  hunting: number;
  crafting: number;
  healing: number;
  cooperation: number;
  signaling: number;
  shelterBuilding: number;
  preservation: number;
  protoAgriculture: number;
}

export interface EpisodicMemoryItem {
  tick: number;
  sectorKey: string;
  action: AgentActionType;
  targetId?: string;
  outcomeSummary: string;
  reward: number;
  tdError: number;
  success: boolean;
}

export interface LongTermMemorySummary {
  knownSafeEntities: string[];
  knownDangerousEntities: string[];
  preferredSectors: string[];
  consolidatedLessons: number;
  recentActionCounts: Record<string, number>;
}

export interface SocialRelationship {
  targetId: string;
  trust: number;
  affinity: number;
  interactions: number;
  cooperations: number;
  conflicts: number;
  lastTick: number;
}

export interface EmergentVocabularyEntry {
  symbol: string;
  meaning: string;
  confidence: number;
  exposures: number;
  firstHeardTick: number;
}

export interface NeuralBrainState {
  architectureVersion: string;
  inputSize: number;
  hiddenSize: number;
  outputSize: number;
  w1: number[];
  b1: number[];
  wPolicy: number[];
  bPolicy: number[];
  wValue: number[];
  bValue: number;
  fisherImportance: number[];
  anchorWeights: number[];
  trainingSteps: number;
  optimizerStep: number;
  currentLearningRate: number;
  momentumW1: number[];
  momentumWPolicy: number[];
  momentumWValue: number[];
  avgLoss: number;
  avgTdError: number;
  predictionAccuracy: number;
  policyEntropy: number;
  lastActionProbabilities: number[];
}

export interface RLStats {
  totalDecisions: number;
  totalReward: number;
  shortTermRewardSum: number;
  longTermRewardSum: number;
  successfulActions: number;
  failedActions: number;
  rewardHackingFlags: number;
  replayUpdates: number;
  retentionScore: number;
  forgettingRate: number;
}

export interface AgentIdentity {
  id: string;
  name: string;
  birthTick: number;
  originType:
    | 'initial'
    | 'natural_birth'
    | 'isolated_promoted'
    | 'recovery_revived'
    | 'recovery_new';
  lineageIds: string[];
  geneticTraits: GeneticTraits;
}

export interface AgentState {
  identity: AgentIdentity;
  generation: number;
  ageTicks: number;
  ageStage: 'child' | 'adult' | 'elder';
  sex: 'female' | 'male';
  alive: boolean;
  deathTick?: number;
  causeOfDeath?: string;
  sectorX: number;
  sectorY: number;
  physical: PhysicalState;
  psychological: PsychologicalState;
  needs: AgentNeeds;
  personality: PersonalityTraits;
  skills: AgentSkills;
  knowledgeIds: string[];
  vocabulary: Record<string, EmergentVocabularyEntry>;
  episodicMemory: EpisodicMemoryItem[];
  longTermMemory: LongTermMemorySummary;
  relationships: Record<string, SocialRelationship>;
  inventory: {
    food: number;
    water: number;
    tools: number;
    materials: number;
  };
  brain: NeuralBrainState;
  rlStats: RLStats;
  offspringCount: number;
  parentIds: string[];
  gestationCooldown: number;
  lastAction?: AgentActionType;
  lastActionReason?: string;
  lastActionOutcome?: string;
}

export interface CollectiveExperienceRecord {
  id: string;
  agentId: string;
  agentAge: number;
  generation: number;
  physicalBefore: {
    hunger: number;
    thirst: number;
    health: number;
    energy: number;
  };
  psychologicalBefore: {
    stress: number;
    morale: number;
  };
  activeNeeds: string[];
  environmentalConditions: {
    biome: BiomeType;
    season: string;
    temperatureC: number;
    hazardLevel: number;
  };
  sectorKey: string;
  simTimeTick: number;
  observations: string[];
  chosenAction: AgentActionType;
  actionReason: string;
  immediateOutcome: string;
  delayedOutcomes: string[];
  reward: number;
  shortTermReward: number;
  longTermReward: number;
  damages: number;
  resourcesDelta: {
    food: number;
    water: number;
    materials: number;
  };
  entityKey: string;
  category: KnowledgeCategory;
  success: boolean;
  repetitions: number;
  successCount: number;
  failureCount: number;
  reliabilityScore: number;
  stateVector: number[];
  actionIndex: number;
}

export interface CivilizationKnowledgeItem {
  id: string;
  entityKey: string;
  titleAr: string;
  category: KnowledgeCategory;
  summaryAr: string;
  discoveredAtTick: number;
  discovererId: string;
  discovererGeneration: number;
  totalTrials: number;
  uniqueExperimenters: number;
  experimenterIds: string[];
  successCount: number;
  failureCount: number;
  confidence: number;
  certaintyStatus: CertaintyStatus;
  lastTestedTick: number;
  stillActive: boolean;
  conditionsTested: string[];
}

export interface EmergentSymbol {
  id: string;
  symbol: string;
  meaningKey: string;
  meaningAr: string;
  originatorId: string;
  generation: number;
  createdTick: number;
  adoptersCount: number;
  successfulUses: number;
  failedUses: number;
  confidence: number;
}

export type TelemetryEventType =
  | 'AgentDecision'
  | 'AgentAction'
  | 'RewardReceived'
  | 'LearningUpdate'
  | 'SkillDiscovered'
  | 'ExperienceRecorded'
  | 'KnowledgeUpdated'
  | 'FoodConsumed'
  | 'WaterConsumed'
  | 'HuntingStarted'
  | 'HuntingSucceeded'
  | 'HuntingFailed'
  | 'AgentInjured'
  | 'AgentBorn'
  | 'AgentDied'
  | 'PopulationChanged'
  | 'RelationshipChanged'
  | 'CommunicationObserved'
  | 'GenerationChanged'
  | 'ExtinctionDetected'
  | 'RebirthStarted'
  | 'CheckpointStarted'
  | 'CheckpointCompleted'
  | 'CheckpointFailed'
  | 'TrainingPaused'
  | 'TrainingResumed'
  | 'TrainingCompleted'
  | 'discovery'
  | 'forage'
  | 'water'
  | 'hunt'
  | 'injury'
  | 'poison'
  | 'cooperation'
  | 'sharing'
  | 'conflict'
  | 'reconciliation'
  | 'communication'
  | 'social_learning'
  | 'crafting'
  | 'birth'
  | 'death'
  | 'crisis'
  | 'extinction'
  | 'recovery'
  | 'training_promotion'
  | 'reward_hacking_guard';

export interface SimulationEvent {
  id: string;
  eventId?: string;
  simulationId?: string;
  runId?: string;
  sequence?: number;
  tick: number;
  simulationTick?: number;
  timestamp: string;
  generation?: number;
  type: TelemetryEventType;
  agentId?: string;
  agentName?: string;
  sectorKey?: string;
  titleAr: string;
  detailAr: string;
  severity: 'info' | 'positive' | 'warning' | 'critical';
  payload?: Record<string, unknown>;
}

export type WorkflowOperationalStatus =
  | 'Idle'
  | 'Initializing'
  | 'Running'
  | 'Completed'
  | 'Failed'
  | 'Interrupted';

export type SimOperationalStatus =
  | 'Initializing'
  | 'Running'
  | 'Pausing'
  | 'Paused'
  | 'SavingCheckpoint'
  | 'RestoringCheckpoint'
  | 'Completed'
  | 'Failed'
  | 'Interrupted'
  | 'Recovering';

export type PersistenceOperationalStatus =
  | 'Ready'
  | 'SavingCheckpoint'
  | 'RestoringCheckpoint'
  | 'Error';

export interface TimelineMilestone {
  id: string;
  tick: number;
  generation: number;
  milestoneType: string;
  titleAr: string;
  descriptionAr: string;
  agentId?: string;
  preservedAcrossExtinction: boolean;
}

export interface GenerationSummary {
  generation: number;
  startedAtTick: number;
  endedAtTick?: number;
  totalAgents: number;
  aliveCount: number;
  births: number;
  deaths: number;
  avgLifespanTicks: number;
  avgReward: number;
  avgSkillTotal: number;
  knowledgeDiscoveredCount: number;
  childSurvivalRate: number;
  avgOffspring: number;
  topCausesOfDeath: Record<string, number>;
}

export interface ExtinctionRecord {
  id: string;
  tick: number;
  timestamp: string;
  generationAtExtinction: number;
  extinctPopulationCount: number;
  rootCausesAr: string[];
  resourceSnapshot: {
    totalPlants: number;
    totalWater: number;
    totalAnimals: number;
  };
  preservedExperienceCount: number;
  preservedKnowledgeCount: number;
  preservedBrainCount: number;
  recoveryAttempted: boolean;
  recoveryId?: string;
}

export interface RecoveryEvent {
  id: string;
  tick: number;
  timestamp: string;
  extinctionId: string;
  policy: RecoveryPolicyMode;
  attemptNumber: number;
  success: boolean;
  newGenerationNumber: number;
  restoredAgentsCount: number;
  notesAr: string;
}

export interface BrainPackage {
  packageId: string;
  createdAt: string;
  engineVersion: string;
  schemaVersion: string;
  architectureVersion: string;
  compatibilityVersion: string;
  trainingMetadata: {
    sessionId: string;
    episodesCompleted: number;
    totalSteps: number;
    avgSurvivalTicks: number;
    avgReward: number;
    actionSuccessRate: number;
    evaluationPassed: boolean;
    evaluationNotesAr: string;
  };
  learnedSkills: AgentSkills;
  policyParameters: {
    inputSize: number;
    hiddenSize: number;
    outputSize: number;
  };
  weights: NeuralBrainState;
  knowledgeRefs: string[];
  memoryState: EpisodicMemoryItem[];
  identityTemplate: {
    suggestedName: string;
    personality: PersonalityTraits;
    geneticTraits: GeneticTraits;
  };
  integrityHash: string;
}

export interface PromotionVerificationResult {
  passed: boolean;
  packageId: string;
  checks: Array<{
    nameAr: string;
    passed: boolean;
    detailAr: string;
  }>;
  promotedAgentId?: string;
  reasonAr: string;
}

export interface TrainingSessionState {
  sessionId: string;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'stopped';
  episodesTarget: number;
  episodesCompleted: number;
  totalSteps: number;
  focusMode: 'balanced' | 'survival' | 'hunting' | 'cooperation';
  currentCohortSize: number;
  avgReward: number;
  avgSurvivalRate: number;
  actionSuccessRate: number;
  rewardHistory: Array<{ episode: number; avgReward: number; survivalRate: number }>;
  evaluationPassed: boolean;
  lastPackageId?: string;
  errorMessage?: string;
  updatedAt: string;
}

export interface PerformanceBenchmarks {
  cpuUserMs: number;
  cpuSystemMs: number;
  rssMb: number;
  heapUsedMb: number;
  lastDecisionDurationMs: number;
  decisionsPerSecond: number;
  experienceDbCount: number;
  experienceRecallTimeMs: number;
  latestCheckpointBytes: number;
  sqliteDbBytes: number;
}

export interface ChunkDescriptor {
  file: string;
  rawBytes: number;
  compressedBytes: number;
  rawSha256: string;
  compressedSha256: string;
  itemCount: number;
}

export interface DomainManifestEntry {
  domain: string;
  domainSha256: string;
  totalRawBytes: number;
  totalCompressedBytes: number;
  chunks: ChunkDescriptor[];
}

export interface CheckpointManifest {
  format?: 'chunked-v2' | 'legacy-v1';
  checkpointId: string;
  simulationId: string;
  workflowRunId: string;
  schemaVersion: string;
  engineVersion: string;
  serializationVersion: string;
  savedAt: string;
  runId: string;
  generationNumber: number;
  tick: number;
  trainingStep: number;
  aliveCount: number;
  compatibilityRange: string;
  domainCount: number;
  chunkCount: number;
  domains?: Record<string, DomainManifestEntry>;
  rootChecksum: string;
  integrityHash: string;
  domainChecksums: Record<string, string>;
  compressedBytes: number;
  complete: boolean;
  corrupted?: boolean;
}

export interface TelemetryHistoryPoint {
  tick: number;
  alive: number;
  birthsCumulative: number;
  deathsCumulative: number;
  avgHealth: number;
  avgHunger: number;
  avgThirst: number;
  avgReward: number;
  retentionScore: number;
  forgettingRate: number;
  totalPlants: number;
  totalWater: number;
  knowledgeCount: number;
  symbolsCount: number;
}

export interface AgentSummaryView {
  id: string;
  name: string;
  generation: number;
  ageTicks: number;
  ageStage: 'child' | 'adult' | 'elder';
  sex: 'female' | 'male';
  alive: boolean;
  causeOfDeath?: string;
  sectorKey: string;
  hunger: number;
  thirst: number;
  health: number;
  energy: number;
  stress: number;
  totalReward: number;
  totalDecisions: number;
  actionSuccessRate: number;
  retentionScore: number;
  forgettingRate: number;
  skillsSum: number;
  knowledgeCount: number;
  vocabularyCount: number;
  relationshipsCount: number;
  offspringCount: number;
  lastAction?: AgentActionType;
  lastActionOutcome?: string;
  originType: AgentIdentity['originType'];
}

export interface TelemetrySnapshot {
  schemaVersion: string;
  engineVersion: string;
  simulationId: string;
  runId: string;
  workflowName: string;
  startedAt: string;
  lastSequence: number;
  serverTime: string;
  workflowStatus: WorkflowOperationalStatus;
  simStatus: SimOperationalStatus;
  speedMultiplier: number;
  elapsedRealSeconds: number;
  tick: number;
  worldDays: number;
  currentGeneration: number;
  recoveryPolicy: RecoveryPolicyMode;

  population: {
    totalCreated: number;
    alive: number;
    deceased: number;
    births: number;
    deaths: number;
    children: number;
    adults: number;
    elders: number;
    females: number;
    males: number;
    reproductionCapable: number;
    birthRatePer100Ticks: number;
    deathRatePer100Ticks: number;
    avgLifespanTicks: number;
    reproductionRate: number;
    childSurvivalRate: number;
    avgOffspring: number;
    avgHealth: number;
    avgHunger: number;
    avgThirst: number;
    avgEnergy: number;
    sectorOccupancy: Record<string, number>;
  };

  mindsAndLearning: {
    activeBrains: number;
    savedBrains: number;
    deceasedBrains: number;
    restoredBrains: number;
    neuralNetworksCount: number;
    totalTrainingSteps: number;
    totalExperiencesRecorded: number;
    totalExperiencesReplayed: number;
    experienceDbSize: number;
    totalDecisions: number;
    totalReward: number;
    avgReward: number;
    actionSuccessRate: number;
    actionFailureRate: number;
    predictionAccuracy: number;
    avgRetentionScore: number;
    avgForgettingRate: number;
    strategyDiversity: number;
    rewardHackingFlags: number;
    neuralNetworkDetails: {
      architectureVersion: string;
      inputSize: number;
      hiddenSize: number;
      outputSize: number;
      parametersPerBrain: number;
      activationFunction: string;
      continualLearningMethod: string;
      avgLoss: number;
      avgTdError: number;
      avgPolicyEntropy: number;
      actionDistribution: Record<string, number>;
    };
  };

  environment: {
    areaKm2: number;
    season: WorldState['season'];
    temperatureC: number;
    rainfall: number;
    climateStress: number;
    totalPlants: number;
    totalWater: number;
    totalAnimals: number;
    totalStone: number;
    totalWood: number;
    totalFiber: number;
    sheltersBuilt: number;
    foodCaches: number;
    waterCaches: number;
    plantedPlots: number;
    consumptionRate: number;
    regenerationRate: number;
    sectors: Array<{
      key: string;
      x: number;
      y: number;
      biome: BiomeType;
      plantSupply: number;
      waterVolume: number;
      waterContaminated: boolean;
      animalsCount: number;
      predatorsCount: number;
      hazardLevel: number;
      agentsCount: number;
      sheltersBuilt: number;
      foodCaches: number;
    }>;
  };

  societyAndLanguage: {
    totalRelationships: number;
    positiveRelationships: number;
    negativeRelationships: number;
    formedGroups: number;
    cooperationRate: number;
    conflictRate: number;
    knowledgeExchanges: number;
    observationalLearnings: number;
    signalsCount: number;
    vocabularyCount: number;
    collectiveCommunicationLevel: number;
    symbols: EmergentSymbol[];
  };

  survivalAndExtinction: {
    riskLevel: ExtinctionRiskLevel;
    survivalRate: number;
    unmetNeedsRatio: number;
    causesOfDeath: Record<string, number>;
    crisisDiagnosticsAr: string[];
    extinctionCount: number;
    recoveryCount: number;
    consecutiveFailedRecoveries: number;
    extinctionRecords: ExtinctionRecord[];
    recoveryEvents: RecoveryEvent[];
  };

  persistenceStatus: {
    sqliteReady: boolean;
    state: PersistenceOperationalStatus;
    lastCheckpointAt?: string;
    lastCheckpointId?: string;
    lastRootChecksum?: string;
    lastError?: string;
    totalCheckpoints: number;
    checkpoints: CheckpointManifest[];
  };

  knowledgeItems: CivilizationKnowledgeItem[];
  recentExperiences: CollectiveExperienceRecord[];
  generations: GenerationSummary[];
  timeline: TimelineMilestone[];
  recentEvents: SimulationEvent[];
  agents: AgentSummaryView[];
  history: TelemetryHistoryPoint[];
  training: TrainingSessionState;
  packages: BrainPackage[];
  benchmarks: PerformanceBenchmarks;
}
