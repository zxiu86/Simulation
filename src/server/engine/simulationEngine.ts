import crypto from 'node:crypto';
import {
  AGENT_ACTIONS,
  ENGINE_VERSION,
  GRID_SIZE,
  INITIAL_POPULATION,
  SCHEMA_VERSION,
  type AgentActionType,
  type AgentState,
  type AgentSummaryView,
  type BrainPackage,
  type CheckpointManifest,
  type ExtinctionRecord,
  type ExtinctionRiskLevel,
  type GenerationSummary,
  type KnowledgeCategory,
  type PerformanceBenchmarks,
  type RecoveryEvent,
  type RecoveryPolicyMode,
  type SimulationEvent,
  type TelemetryHistoryPoint,
  type TelemetrySnapshot,
  type TimelineMilestone,
  type TrainingSessionState,
  type WorldSector,
  type WorldState,
} from '../../shared/types.ts';
import { createAgent } from './agentFactory.ts';
import { CollectiveMemorySystem } from './collectiveMemory.ts';
import {
  forwardBrain,
  INPUT_SIZE,
  updateBrainActorCritic,
} from './neuralBrain.ts';
import { createInitialWorld, stepWorldEcology } from './world.ts';

const MAX_RECENT_EVENTS = 400;
const MAX_HISTORY_POINTS = 240;
const MAX_EPISODIC_MEMORY = 40;
const MAX_CONSECUTIVE_FAILED_RECOVERIES = 5;

const ACTION_LABELS_AR: Record<AgentActionType, string> = {
  explore: 'استكشاف البيئة',
  forage_plant: 'جمع وتجربة نبات',
  drink_water: 'البحث عن الماء والشرب',
  hunt_prey: 'مطاردة وصيد',
  observe_peer: 'مراقبة فرد آخر',
  cooperate_task: 'تعاون جماعي',
  share_resource: 'مشاركة الموارد',
  rest_sleep: 'راحة ونوم',
  craft_attempt: 'تشكيل أداة أو مأوى',
  emit_signal: 'إصدار إشارة تواصل',
  tend_child: 'رعاية الصغار',
  reconcile_or_bond: 'توثيق علاقة اجتماعية',
  treat_ailment: 'عناية صحية وتطهير',
  move_sector: 'الانتقال لقطاع مجاور',
};

const EMERGENT_SIGNAL_POOL = [
  'كـا',
  'مـو',
  'نـي',
  'تـو',
  'رـا',
  'سـي',
  'لـو',
  'دـا',
  'وـر',
  'هـا',
  'زـي',
  'فـو',
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export interface SerializedEngineDomains {
  worldState: WorldState;
  agentsState: Array<Omit<AgentState, 'brain' | 'episodicMemory' | 'longTermMemory'>>;
  neuralWeights: Record<string, AgentState['brain']>;
  personalMemories: Record<
    string,
    {
      episodicMemory: AgentState['episodicMemory'];
      longTermMemory: AgentState['longTermMemory'];
    }
  >;
  collectiveExperiences: CollectiveMemorySystem['experiences'];
  civilizationKnowledge: ReturnType<CollectiveMemorySystem['getKnowledgeArray']>;
  symbols: ReturnType<CollectiveMemorySystem['getSymbolsArray']>;
  generations: GenerationSummary[];
  eventLogs: SimulationEvent[];
  timeline: TimelineMilestone[];
  extinctionRecords: ExtinctionRecord[];
  recoveryEvents: RecoveryEvent[];
  preservedRevivalPool: AgentState[];
  history: TelemetryHistoryPoint[];
  meta: {
    runId: string;
    currentGeneration: number;
    recoveryPolicy: RecoveryPolicyMode;
    serialCounter: number;
    birthsCount: number;
    deathsCount: number;
    restoredBrainsCount: number;
    observationalLearnings: number;
    consecutiveFailedRecoveries: number;
    lastRecoveryAttemptTick: number;
    milestoneFlags: Record<string, boolean>;
    totalExperiencesRecorded: number;
    totalExperiencesReplayed: number;
    totalKnowledgeExchanges: number;
    speedMultiplier: number;
    elapsedRealSeconds: number;
  };
}

export class CivilizationSimulationEngine {
  public world: WorldState;
  public agents: AgentState[] = [];
  public collectiveMemory: CollectiveMemorySystem;
  public simStatus: 'running' | 'paused' | 'recovering' = 'paused';
  public speedMultiplier = 1;
  public elapsedRealSeconds = 0;
  public currentGeneration = 1;
  public recoveryPolicy: RecoveryPolicyMode = 'spawn_new_generation';
  public serialCounter = 0;
  public birthsCount = 0;
  public deathsCount = 0;
  public restoredBrainsCount = 0;
  public observationalLearnings = 0;
  public consecutiveFailedRecoveries = 0;
  public lastRecoveryAttemptTick = -100;

  public generationsMap: Map<number, GenerationSummary> = new Map();
  public events: SimulationEvent[] = [];
  public timeline: TimelineMilestone[] = [];
  public extinctionRecords: ExtinctionRecord[] = [];
  public recoveryEvents: RecoveryEvent[] = [];
  public preservedRevivalPool: AgentState[] = [];
  public history: TelemetryHistoryPoint[] = [];
  public milestoneFlags: Record<string, boolean> = {};

  // External references supplied by server / storage
  public sqliteReady = false;
  public checkpoints: CheckpointManifest[] = [];
  public trainingState: TrainingSessionState = {
    sessionId: 'none',
    status: 'idle',
    episodesTarget: 20,
    episodesCompleted: 0,
    totalSteps: 0,
    focusMode: 'balanced',
    currentCohortSize: 12,
    avgReward: 0,
    avgSurvivalRate: 0,
    actionSuccessRate: 0,
    rewardHistory: [],
    evaluationPassed: false,
    updatedAt: new Date().toISOString(),
  };
  public brainPackages: BrainPackage[] = [];
  public sqliteDbBytes = 0;
  public latestCheckpointBytes = 0;

  // Performance counters
  private lastDecisionDurationMs = 0;
  private decisionsPerSecond = 0;
  private experienceRecallTimeMs = 0;
  private lastConsumptionEstimate = 0;
  private lastRegenerationEstimate = 0;
  private pendingRecoveryAtTick: number | null = null;
  private crisisDiagnosticsAr: string[] = [];

  constructor(runId?: string) {
    const id = runId ?? `run_${Date.now()}`;
    this.world = createInitialWorld(id);
    this.collectiveMemory = new CollectiveMemorySystem();
    this.initializePopulation(INITIAL_POPULATION, 1, 'initial');
  }

  public reset(newRunId?: string): void {
    const id = newRunId ?? `run_${Date.now()}`;
    this.world = createInitialWorld(id);
    this.collectiveMemory = new CollectiveMemorySystem();
    this.agents = [];
    this.generationsMap.clear();
    this.events = [];
    this.timeline = [];
    this.extinctionRecords = [];
    this.recoveryEvents = [];
    this.preservedRevivalPool = [];
    this.history = [];
    this.milestoneFlags = {};
    this.currentGeneration = 1;
    this.serialCounter = 0;
    this.birthsCount = 0;
    this.deathsCount = 0;
    this.restoredBrainsCount = 0;
    this.observationalLearnings = 0;
    this.consecutiveFailedRecoveries = 0;
    this.lastRecoveryAttemptTick = -100;
    this.pendingRecoveryAtTick = null;
    this.crisisDiagnosticsAr = [];
    this.initializePopulation(INITIAL_POPULATION, 1, 'initial');
  }

  private initializePopulation(
    count: number,
    generation: number,
    originType: AgentState['identity']['originType'],
  ): void {
    this.ensureGenerationEntry(generation, this.world.tick);
    for (let i = 0; i < count; i++) {
      const agent = createAgent({
        serialIndex: this.serialCounter++,
        generation,
        birthTick: this.world.tick,
        originType,
        ageStage: 'adult',
      });
      this.agents.push(agent);
      const gen = this.generationsMap.get(generation)!;
      gen.totalAgents += 1;
      gen.aliveCount += 1;
    }

    if (this.timeline.length === 0) {
      this.addTimelineMilestone(
        'world_origin',
        this.world.tick,
        generation,
        'نشأة العالم الأولي',
        `انطلقت المحاكاة بـ ${count} فرد مستقل في بيئة مساحتها 5 كم² دون لغة أو أدوات أو معرفة جاهزة.`,
      );
    }
  }

  private ensureGenerationEntry(generation: number, tick: number): GenerationSummary {
    let gen = this.generationsMap.get(generation);
    if (!gen) {
      gen = {
        generation,
        startedAtTick: tick,
        totalAgents: 0,
        aliveCount: 0,
        births: 0,
        deaths: 0,
        avgLifespanTicks: 0,
        avgReward: 0,
        avgSkillTotal: 0,
        knowledgeDiscoveredCount: 0,
        childSurvivalRate: 1,
        avgOffspring: 0,
        topCausesOfDeath: {},
      };
      this.generationsMap.set(generation, gen);
      if (generation > 1) {
        this.addTimelineMilestone(
          `gen_start_${generation}`,
          tick,
          generation,
          `بداية الجيل ${generation}`,
          `ظهر الجيل ${generation} بعقول مستقلة وقدرة على الاستفادة من سجل التجارب التراكمي.`,
        );
      }
    }
    return gen;
  }

  private addTimelineMilestone(
    milestoneType: string,
    tick: number,
    generation: number,
    titleAr: string,
    descriptionAr: string,
    agentId?: string,
  ): void {
    if (this.milestoneFlags[milestoneType]) return;
    this.milestoneFlags[milestoneType] = true;
    this.timeline.push({
      id: `ms_${tick}_${milestoneType}`,
      tick,
      generation,
      milestoneType,
      titleAr,
      descriptionAr,
      agentId,
      preservedAcrossExtinction: true,
    });
  }

  private emitEvent(event: Omit<SimulationEvent, 'id' | 'tick' | 'timestamp'>): void {
    this.events.unshift({
      id: `evt_${this.world.tick}_${Math.random().toString(36).slice(2, 8)}`,
      tick: this.world.tick,
      timestamp: new Date().toISOString(),
      ...event,
    });
    if (this.events.length > MAX_RECENT_EVENTS) {
      this.events.length = MAX_RECENT_EVENTS;
    }
  }

  private getSector(x: number, y: number): WorldSector {
    const cx = clamp(Math.floor(x), 0, GRID_SIZE - 1);
    const cy = clamp(Math.floor(y), 0, GRID_SIZE - 1);
    return this.world.sectors[cy * GRID_SIZE + cx];
  }

  private getAgentsInSector(sectorKey: string, excludeId?: string): AgentState[] {
    return this.agents.filter(
      (a) => a.alive && `${a.sectorX},${a.sectorY}` === sectorKey && a.identity.id !== excludeId,
    );
  }

  private buildObservationVector(agent: AgentState, sector: WorldSector, peers: AgentState[]): {
    vec: number[];
    actionMask: boolean[];
    observationsAr: string[];
  } {
    const hasWater = sector.waterSource && sector.waterSource.volume > 2 ? 1 : 0;
    const waterQuery = sector.waterSource
      ? this.collectiveMemory.queryKnowledgeForAgent(`water_${sector.waterSource.kind}`)
      : { known: false, confidence: 0.5, trials: 0, experimenters: 0, successCount: 0, failureCount: 0, certaintyStatus: 'unconfirmed' as const };

    const plantId = sector.plantSpeciesIds[0];
    const plantQuery = plantId
      ? this.collectiveMemory.queryKnowledgeForAgent(plantId)
      : { known: false, confidence: 0.5, trials: 0, experimenters: 0, successCount: 0, failureCount: 0, certaintyStatus: 'unconfirmed' as const };

    const preyCount = sector.animals.reduce((acc, a) => acc + (a.temperament !== 'predator' ? a.count : 0), 0);
    const predCount = sector.animals.reduce((acc, a) => acc + (a.temperament === 'predator' ? a.count : 0), 0);
    const hasChildPeer = peers.some((p) => p.ageStage === 'child' && (p.physical.hunger > 45 || p.physical.thirst > 45));

    let avgPeerTrust = 0;
    if (peers.length > 0) {
      let sum = 0;
      for (const p of peers) {
        sum += agent.relationships[p.identity.id]?.trust ?? 0;
      }
      avgPeerTrust = sum / peers.length;
    }

    const vec = new Array<number>(INPUT_SIZE).fill(0);
    vec[0] = agent.physical.hunger / 100;
    vec[1] = agent.physical.thirst / 100;
    vec[2] = agent.physical.health / 100;
    vec[3] = agent.physical.energy / 100;
    vec[4] = (agent.physical.fatigue + agent.physical.sleepNeed) / 200;
    vec[5] = (agent.physical.injury + agent.physical.illness) / 200;
    vec[6] = agent.physical.poison / 100;
    vec[7] = agent.psychological.stress / 100;
    vec[8] = agent.psychological.loneliness / 100;
    vec[9] = clamp(sector.plantSupply / 200, 0, 1);
    vec[10] = hasWater ? clamp((sector.waterSource?.volume ?? 0) / 500, 0, 1) : 0;
    vec[11] = waterQuery.known ? waterQuery.confidence : 0.5;
    vec[12] = clamp(preyCount / 10, 0, 1);
    vec[13] = clamp(sector.hazardLevel + predCount * 0.2, 0, 1);
    vec[14] = clamp(peers.length / 8, 0, 1);
    vec[15] = clamp((avgPeerTrust + 1) / 2, 0, 1);
    vec[16] = clamp(agent.inventory.food / 5, 0, 1);
    vec[17] = clamp(agent.inventory.water / 5, 0, 1);
    vec[18] = clamp(agent.inventory.tools / 3, 0, 1);
    vec[19] = clamp((sector.stoneSupply + sector.woodSupply + sector.fiberSupply) / 400, 0, 1);
    vec[20] = hasChildPeer ? 1 : 0;
    vec[21] = plantQuery.known ? plantQuery.confidence : 0.5;
    vec[22] = clamp(Object.keys(agent.vocabulary).length / 6, 0, 1);
    vec[23] = this.world.climateStress;

    const actionMask = AGENT_ACTIONS.map((act) => {
      if (act === 'forage_plant') return sector.plantSupply >= 4 || agent.inventory.food > 0;
      if (act === 'drink_water') return hasWater === 1 || agent.inventory.water > 0;
      if (act === 'hunt_prey') return preyCount > 0 || predCount > 0;
      if (act === 'observe_peer' || act === 'cooperate_task' || act === 'reconcile_or_bond') return peers.length > 0;
      if (act === 'share_resource') return peers.length > 0 && (agent.inventory.food > 0 || agent.inventory.water > 0);
      if (act === 'tend_child') return hasChildPeer;
      return true;
    });

    const observationsAr: string[] = [
      `القطاع ${sector.key} (${sector.biome})`,
      hasWater ? `مصدر مياه متاح (${sector.waterSource?.kind})` : 'لا يوجد مصدر مياه محلي',
      `نباتات: ${Math.round(sector.plantSupply)}`,
      `أقران قريبون: ${peers.length}`,
    ];

    return { vec, actionMask, observationsAr };
  }

  public step(): void {
    const t0 = performance.now();
    const { totalRegenerated } = stepWorldEcology(this.world);
    this.lastRegenerationEstimate = totalRegenerated;

    // Handle pending extinction recovery if scheduled
    const aliveBefore = this.agents.filter((a) => a.alive);
    if (aliveBefore.length === 0) {
      if (this.pendingRecoveryAtTick === null) {
        this.pendingRecoveryAtTick = this.world.tick + 1;
      }
      if (this.world.tick >= this.pendingRecoveryAtTick) {
        this.executeExtinctionRecovery();
      }
      this.recordHistorySnapshot();
      return;
    }

    let stepConsumed = 0;
    let stepDecisions = 0;
    const newBabies: AgentState[] = [];

    for (const agent of aliveBefore) {
      // 1. Update biological clock, metabolism & delayed effects
      this.advanceAgentBiology(agent);
      if (!agent.alive) continue;

      const sector = this.getSector(agent.sectorX, agent.sectorY);
      const peers = this.getAgentsInSector(sector.key, agent.identity.id);
      const obsBefore = this.buildObservationVector(agent, sector, peers);

      //Snapshot physical/psych before action
      const physBefore = {
        hunger: Number(agent.physical.hunger.toFixed(1)),
        thirst: Number(agent.physical.thirst.toFixed(1)),
        health: Number(agent.physical.health.toFixed(1)),
        energy: Number(agent.physical.energy.toFixed(1)),
      };
      const psychBefore = {
        stress: Number(agent.psychological.stress.toFixed(1)),
        morale: Number(agent.psychological.morale.toFixed(1)),
      };
      const activeNeeds = this.extractActiveNeeds(agent);

      // 2. Policy decision via independent Neural Brain
      const explorationTemp = clamp(0.7 + (1 - agent.rlStats.retentionScore) * 0.4 + agent.personality.boldness * 0.25, 0.55, 1.3);
      const forward = forwardBrain(agent.brain, obsBefore.vec, explorationTemp, obsBefore.actionMask);
      stepDecisions += 1;
      agent.rlStats.totalDecisions += 1;
      agent.lastAction = forward.chosenAction;
      agent.lastActionReason = forward.actionReasonAr;

      // Track repetition for Anti-Reward-Hacking
      const prevCount = agent.longTermMemory.recentActionCounts[forward.chosenAction] ?? 0;
      agent.longTermMemory.recentActionCounts[forward.chosenAction] = prevCount + 1;

      // 3. Execute action in environment
      const outcome = this.executeAgentAction(agent, forward.chosenAction, sector, peers, newBabies);
      stepConsumed += outcome.consumedAmount;
      agent.lastActionOutcome = outcome.immediateOutcomeAr;

      // 4. Multi-dimensional Reward & Anti-Reward-Hacking guard
      let reward = outcome.shortTermReward + outcome.longTermReward;
      const repeatThreshold = 6;
      if (
        prevCount >= repeatThreshold &&
        outcome.resourcesDelta.food === 0 &&
        outcome.resourcesDelta.water === 0 &&
        !outcome.success
      ) {
        // Penalize sterile repetitive behavior (Reward Hacking mitigation)
        reward -= 0.45;
        agent.rlStats.rewardHackingFlags += 1;
        if (agent.rlStats.rewardHackingFlags % 5 === 1) {
          this.emitEvent({
            type: 'reward_hacking_guard',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: 'ضبط تكرار غير منتج',
            detailAr: `تم رصد وتثبيط تكرار فعل (${ACTION_LABELS_AR[forward.chosenAction]}) دون عائد فعلي لدى ${agent.identity.name}.`,
            severity: 'warning',
          });
        }
      }
      if (this.world.tick % 12 === 0) {
        agent.longTermMemory.recentActionCounts = {};
      }

      agent.rlStats.totalReward += reward;
      agent.rlStats.shortTermRewardSum += outcome.shortTermReward;
      agent.rlStats.longTermRewardSum += outcome.longTermReward;
      if (outcome.success) {
        agent.rlStats.successfulActions += 1;
      } else {
        agent.rlStats.failedActions += 1;
      }

      // 5. Observe next state & update independent RL Brain
      const nextSector = this.getSector(agent.sectorX, agent.sectorY);
      const nextPeers = this.getAgentsInSector(nextSector.key, agent.identity.id);
      const obsAfter = this.buildObservationVector(agent, nextSector, nextPeers);

      const lr = 0.015 + agent.identity.geneticTraits.learningRateGene * 0.025;
      const trainStats = updateBrainActorCritic(
        agent.brain,
        obsBefore.vec,
        forward.chosenIndex,
        reward,
        obsAfter.vec,
        !agent.alive,
        lr,
      );

      agent.rlStats.retentionScore = Number(
        (agent.rlStats.retentionScore * 0.94 + trainStats.retentionDelta * 0.06).toFixed(3),
      );
      agent.rlStats.forgettingRate = Number((1 - agent.rlStats.retentionScore).toFixed(3));

      // 6. Store personal episodic memory
      agent.episodicMemory.push({
        tick: this.world.tick,
        sectorKey: sector.key,
        action: forward.chosenAction,
        targetId: outcome.entityKey,
        outcomeSummary: outcome.immediateOutcomeAr,
        reward: Number(reward.toFixed(3)),
        tdError: Number(trainStats.tdError.toFixed(3)),
        success: outcome.success,
      });
      if (agent.episodicMemory.length > MAX_EPISODIC_MEMORY) {
        agent.episodicMemory.shift();
      }
      if (outcome.success && !agent.longTermMemory.knownSafeEntities.includes(outcome.entityKey)) {
        agent.longTermMemory.knownSafeEntities.push(outcome.entityKey);
        agent.longTermMemory.consolidatedLessons += 1;
      } else if (!outcome.success && outcome.damages > 5 && !agent.longTermMemory.knownDangerousEntities.includes(outcome.entityKey)) {
        agent.longTermMemory.knownDangerousEntities.push(outcome.entityKey);
        agent.longTermMemory.consolidatedLessons += 1;
      }

      // 7. Record into Collective Experience & Generational Learning DB
      if (outcome.recordCollective) {
        const recorded = this.collectiveMemory.recordExperience({
          id: `exp_${this.world.tick}_${agent.identity.id}_${stepDecisions}`,
          agentId: agent.identity.id,
          agentAge: agent.ageTicks,
          generation: agent.generation,
          physicalBefore: physBefore,
          psychologicalBefore: psychBefore,
          activeNeeds,
          environmentalConditions: {
            biome: sector.biome,
            season: this.world.season,
            temperatureC: Number(this.world.temperatureC.toFixed(1)),
            hazardLevel: Number(sector.hazardLevel.toFixed(2)),
          },
          sectorKey: sector.key,
          simTimeTick: this.world.tick,
          observations: obsBefore.observationsAr,
          chosenAction: forward.chosenAction,
          actionReason: forward.actionReasonAr,
          immediateOutcome: outcome.immediateOutcomeAr,
          delayedOutcomes: [],
          reward: Number(reward.toFixed(3)),
          shortTermReward: Number(outcome.shortTermReward.toFixed(3)),
          longTermReward: Number(outcome.longTermReward.toFixed(3)),
          damages: Number(outcome.damages.toFixed(2)),
          resourcesDelta: outcome.resourcesDelta,
          entityKey: outcome.entityKey,
          category: outcome.category,
          success: outcome.success,
          stateVector: obsBefore.vec,
          actionIndex: forward.chosenIndex,
        });

        if (!agent.knowledgeIds.includes(recorded.knowledge.id)) {
          agent.knowledgeIds.push(recorded.knowledge.id);
        }
        if (recorded.isNewDiscovery) {
          this.addTimelineMilestone(
            'first_knowledge',
            this.world.tick,
            agent.generation,
            'أول اكتشاف مسجل',
            `سجل ${agent.identity.name} أول تجربة معرفية: ${recorded.knowledge.titleAr}.`,
            agent.identity.id,
          );
          this.emitEvent({
            type: 'discovery',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: `اكتشاف جديد: ${recorded.knowledge.titleAr}`,
            detailAr: outcome.immediateOutcomeAr,
            severity: outcome.success ? 'positive' : 'warning',
          });
        }
      }

      // 8. Continual Learning via Prioritized Experience Replay (every 6 ticks per agent)
      if (this.world.tick % 6 === 0 && this.collectiveMemory.experiences.length >= 6) {
        const tRecall0 = performance.now();
        const replayBatch = this.collectiveMemory.samplePrioritizedReplayBatch(2);
        this.experienceRecallTimeMs = Number((performance.now() - tRecall0).toFixed(3));
        for (const exp of replayBatch) {
          if (exp.stateVector.length === INPUT_SIZE) {
            updateBrainActorCritic(
              agent.brain,
              exp.stateVector,
              exp.actionIndex,
              exp.reward * 0.45, // attenuated offline replay prevents overriding personal policy
              exp.stateVector,
              false,
              lr * 0.4,
              0.9,
              0.08,
            );
            agent.rlStats.replayUpdates += 1;
          }
        }
      }

      // 9. Natural reproduction check (no forced reproduction cheats!)
      this.attemptNaturalReproduction(agent, peers, newBabies);
    }

    // Add newborns
    for (const baby of newBabies) {
      this.agents.push(baby);
      this.birthsCount += 1;
      const gen = this.ensureGenerationEntry(baby.generation, this.world.tick);
      gen.totalAgents += 1;
      gen.aliveCount += 1;
      gen.births += 1;
      this.addTimelineMilestone(
        'first_birth',
        this.world.tick,
        baby.generation,
        'أول ولادة في العالم',
        `وُلد ${baby.identity.name} في الجيل ${baby.generation} بعقل مستقل وقدرة على التعلم من تجارب الأجيال السابقة.`,
        baby.identity.id,
      );
    }

    this.lastConsumptionEstimate = stepConsumed;
    this.collectiveMemory.updateActiveUsage(this.world.tick);
    this.updateGenerationMetrics();
    this.monitorExtinctionAndCrises();

    const elapsedMs = performance.now() - t0;
    this.lastDecisionDurationMs = Number(elapsedMs.toFixed(2));
    this.decisionsPerSecond = elapsedMs > 0 ? Math.round((stepDecisions / elapsedMs) * 1000) : stepDecisions * 100;
    this.elapsedRealSeconds += Number((elapsedMs / 1000).toFixed(3));

    if (this.world.tick % 4 === 0 || this.history.length === 0) {
      this.recordHistorySnapshot();
    }
  }

  private advanceAgentBiology(agent: AgentState): void {
    agent.ageTicks += 1;
    if (agent.ageTicks < 60) {
      agent.ageStage = 'child';
    } else if (agent.ageTicks < 420) {
      agent.ageStage = 'adult';
    } else {
      agent.ageStage = 'elder';
    }

    if (agent.gestationCooldown > 0) {
      agent.gestationCooldown -= 1;
    }

    const meta = 0.8 + agent.identity.geneticTraits.metabolismRate * 0.6;
    const shelterProtection = this.getSector(agent.sectorX, agent.sectorY).sheltersBuilt > 0 ? 0.72 : 1.0;

    agent.physical.hunger = clamp(agent.physical.hunger + 1.45 * meta, 0, 100);
    agent.physical.thirst = clamp(agent.physical.thirst + 1.85 * meta * (1 + this.world.climateStress * 0.35), 0, 100);
    agent.physical.fatigue = clamp(agent.physical.fatigue + 1.1, 0, 100);
    agent.physical.sleepNeed = clamp(agent.physical.sleepNeed + 1.25, 0, 100);
    agent.physical.energy = clamp(agent.physical.energy - 0.9 * meta, 0, 100);
    agent.psychological.loneliness = clamp(agent.psychological.loneliness + 0.65, 0, 100);

    // Process delayed plant/water poisoning!
    if (agent.physical.poisonTimer > 0) {
      agent.physical.poisonTimer -= 1;
      if (agent.physical.poisonTimer === 0 && agent.physical.pendingPoisonDose > 0) {
        const dose = agent.physical.pendingPoisonDose;
        agent.physical.poison = clamp(agent.physical.poison + dose, 0, 100);
        agent.physical.pendingPoisonDose = 0;
        agent.physical.health = clamp(agent.physical.health - dose * 0.35, 0, 100);
        agent.psychological.stress = clamp(agent.psychological.stress + 18, 0, 100);

        const lastPlantEntity = agent.episodicMemory[agent.episodicMemory.length - 1]?.targetId;
        if (lastPlantEntity) {
          this.collectiveMemory.appendDelayedOutcome(
            agent.identity.id,
            lastPlantEntity,
            `تسمم متأخر بعد الاستهلاك (ضرر ${dose.toFixed(0)})`,
            -1.8,
            true,
          );
        }
        this.emitEvent({
          type: 'poison',
          agentId: agent.identity.id,
          agentName: agent.identity.name,
          generation: agent.generation,
          sectorKey: `${agent.sectorX},${agent.sectorY}`,
          titleAr: 'ظهور أعراض تسمم متأخرة',
          detailAr: `تعرض ${agent.identity.name} لتسمم متأخر بنسبة ${dose.toFixed(0)}% وتأثرت صحته.`,
          severity: 'warning',
        });
      }
    }

    // Active physiological penalties (Hunger & Thirst genuinely impair health & survival!)
    let healthDelta = 0;
    let deathCause: string | null = null;

    if (agent.physical.hunger >= 95) {
      healthDelta -= 4.2;
      deathCause = 'المجاعة الحادة';
    } else if (agent.physical.hunger >= 75) {
      healthDelta -= 1.2;
    }

    if (agent.physical.thirst >= 95) {
      healthDelta -= 5.2;
      deathCause = 'الجفاف الحاد';
    } else if (agent.physical.thirst >= 75) {
      healthDelta -= 1.6;
    }

    if (agent.physical.poison > 0) {
      healthDelta -= agent.physical.poison * 0.14;
      agent.physical.poison = Math.max(0, agent.physical.poison - 2.5);
      if (agent.physical.poison > 35 && !deathCause) deathCause = 'التسمم الغذائي أو المائي';
    }

    if (agent.physical.illness > 0) {
      healthDelta -= agent.physical.illness * 0.1;
      agent.physical.illness = Math.max(0, agent.physical.illness - 1.4);
      if (agent.physical.illness > 40 && !deathCause) deathCause = 'المرض والعدوى';
    }

    if (agent.physical.injury > 0) {
      healthDelta -= agent.physical.injury * 0.08;
      agent.physical.injury = Math.max(0, agent.physical.injury - 1.1);
      if (agent.physical.injury > 50 && !deathCause) deathCause = 'الإصابات البالغة';
    }

    if (this.world.climateStress > 0.45) {
      healthDelta -= 0.7 * shelterProtection;
      if (!deathCause && shelterProtection > 0.9) deathCause = 'قساوة المناخ ونقص المأوى';
    }

    // Natural aging mortality
    if (agent.ageTicks > 560) {
      const oldAgeRisk = (agent.ageTicks - 560) * 0.0025;
      if (Math.random() < oldAgeRisk) {
        healthDelta -= 100;
        deathCause = 'الشيخوخة والوفاة الطبيعية';
      }
    }

    // Natural recovery when well-fed and hydrated
    if (agent.physical.hunger < 45 && agent.physical.thirst < 45 && agent.physical.poison < 5) {
      healthDelta += 1.4;
    }

    agent.physical.health = clamp(agent.physical.health + healthDelta, 0, 100);
    if (agent.physical.health <= 0) {
      this.killAgent(agent, deathCause ?? 'تدهور الحالة الصحية');
    }
  }

  private killAgent(agent: AgentState, causeOfDeath: string): void {
    if (!agent.alive) return;
    agent.alive = false;
    agent.deathTick = this.world.tick;
    agent.causeOfDeath = causeOfDeath;
    this.deathsCount += 1;

    // Save snapshot into revival pool (bounded to 120 most experienced individuals)
    this.preservedRevivalPool.push(JSON.parse(JSON.stringify(agent)) as AgentState);
    if (this.preservedRevivalPool.length > 120) {
      this.preservedRevivalPool.sort((a, b) => b.rlStats.totalReward - a.rlStats.totalReward);
      this.preservedRevivalPool.length = 120;
    }

    const gen = this.generationsMap.get(agent.generation);
    if (gen) {
      gen.aliveCount = Math.max(0, gen.aliveCount - 1);
      gen.deaths += 1;
      gen.topCausesOfDeath[causeOfDeath] = (gen.topCausesOfDeath[causeOfDeath] ?? 0) + 1;
    }

    this.emitEvent({
      type: 'death',
      agentId: agent.identity.id,
      agentName: agent.identity.name,
      generation: agent.generation,
      sectorKey: `${agent.sectorX},${agent.sectorY}`,
      titleAr: `وفاة فرد: ${agent.identity.name}`,
      detailAr: `توفي في الجيل ${agent.generation} عند عمر ${agent.ageTicks} دورة. السبب: ${causeOfDeath}.`,
      severity: 'critical',
    });
  }

  private executeAgentAction(
    agent: AgentState,
    action: AgentActionType,
    sector: WorldSector,
    peers: AgentState[],
    newBabies: AgentState[],
  ): {
    success: boolean;
    shortTermReward: number;
    longTermReward: number;
    damages: number;
    consumedAmount: number;
    resourcesDelta: { food: number; water: number; materials: number };
    entityKey: string;
    category: KnowledgeCategory;
    immediateOutcomeAr: string;
    recordCollective: boolean;
  } {
    void newBabies;
    let shortTermReward = 0;
    let longTermReward = 0;
    let damages = 0;
    let consumedAmount = 0;
    let success = false;
    const resourcesDelta = { food: 0, water: 0, materials: 0 };
    let entityKey = `action_${action}`;
    let category: KnowledgeCategory = 'cooperation';
    let immediateOutcomeAr = '';
    let recordCollective = false;

    if (action === 'forage_plant') {
      category = 'food_plant';
      recordCollective = true;
      if (agent.inventory.food > 0 && agent.physical.hunger > 35) {
        agent.inventory.food -= 1;
        const hungerDrop = Math.min(agent.physical.hunger, 28);
        agent.physical.hunger -= hungerDrop;
        agent.physical.energy = clamp(agent.physical.energy + 12, 0, 100);
        shortTermReward = hungerDrop * 0.04;
        longTermReward = 0.25;
        success = true;
        entityKey = 'stored_food_ration';
        immediateOutcomeAr = `استهلك ${agent.identity.name} غذاءً محفوظاً وخفف الجوع بمقدار ${hungerDrop.toFixed(0)}.`;
      } else if (sector.plantSupply >= 4) {
        // Choose plant species: agents gradually avoid plants flagged as dangerous in collective memory
        let chosenPlantId =
          sector.plantSpeciesIds[Math.floor(Math.random() * sector.plantSpeciesIds.length)];
        for (const pid of sector.plantSpeciesIds) {
          const q = this.collectiveMemory.queryKnowledgeForAgent(pid);
          if (q.known && q.certaintyStatus === 'confirmed' && q.confidence >= 0.65) {
            chosenPlantId = pid;
            break;
          }
        }
        const plant = this.world.plantCatalog[chosenPlantId];
        sector.plantSupply -= 4;
        consumedAmount = 4;
        entityKey = plant.id;

        const skillBonus = 1 + agent.skills.foraging * 0.4;
        const nutrition = plant.nutrition * skillBonus;
        const hungerDrop = Math.min(agent.physical.hunger, nutrition);
        agent.physical.hunger = clamp(agent.physical.hunger - hungerDrop, 0, 100);
        agent.physical.energy = clamp(agent.physical.energy + nutrition * 0.45, 0, 100);
        agent.skills.foraging = clamp(agent.skills.foraging + 0.03, 0, 1);

        if (plant.toxicity > 10) {
          if (plant.delayedOnsetTicks > 0) {
            agent.physical.pendingPoisonDose += plant.toxicity;
            agent.physical.poisonTimer = plant.delayedOnsetTicks;
            immediateOutcomeAr = `جرّب ${plant.localName}: شبع فوري (${hungerDrop.toFixed(0)}) مع أثر سمي غير ظاهر بعد.`;
            shortTermReward = hungerDrop * 0.025;
            success = true; // Initial observation seems okay until delayed onset triggers!
          } else {
            agent.physical.poison = clamp(agent.physical.poison + plant.toxicity, 0, 100);
            damages = plant.toxicity;
            shortTermReward = -0.8;
            longTermReward = -0.5;
            success = false;
            immediateOutcomeAr = `أكل ${plant.localName} وتعرض لتسمم مباشر.`;
          }
        } else {
          if (plant.medicinalValue > 0 && (agent.physical.illness > 0 || agent.physical.poison > 0)) {
            agent.physical.illness = Math.max(0, agent.physical.illness - plant.medicinalValue);
            agent.physical.poison = Math.max(0, agent.physical.poison - plant.medicinalValue * 0.6);
            longTermReward += 0.6;
          }
          if (agent.physical.hunger < 25 && sector.foodCaches >= 0) {
            agent.inventory.food = Math.min(5, agent.inventory.food + 1);
            resourcesDelta.food = 1;
          }
          shortTermReward = hungerDrop * 0.045 + (resourcesDelta.food > 0 ? 0.3 : 0);
          longTermReward += 0.35;
          success = true;
          immediateOutcomeAr = `جمع وأكل ${plant.localName} بأمان (تغذية +${nutrition.toFixed(0)}).`;
          this.addTimelineMilestone(
            'first_safe_food',
            this.world.tick,
            agent.generation,
            'أول اكتشاف غذائي آمن',
            `تحقق ${agent.identity.name} من سلامة ${plant.localName} كمصدر غذاء آمن.`,
            agent.identity.id,
          );
        }
      } else {
        shortTermReward = -0.2;
        entityKey = 'plant_scarcity';
        immediateOutcomeAr = 'لم يجد نباتات كافية في القطاع.';
      }
    } else if (action === 'drink_water') {
      category = 'water_source';
      recordCollective = true;
      if (agent.inventory.water > 0 && agent.physical.thirst > 30) {
        agent.inventory.water -= 1;
        const thirstDrop = Math.min(agent.physical.thirst, 35);
        agent.physical.thirst -= thirstDrop;
        shortTermReward = thirstDrop * 0.045;
        longTermReward = 0.25;
        success = true;
        entityKey = 'stored_water_ration';
        immediateOutcomeAr = 'شرب من مخزون المياه المحفوظ.';
      } else if (sector.waterSource && sector.waterSource.volume >= 3) {
        const ws = sector.waterSource;
        ws.volume -= 3;
        consumedAmount = 3;
        entityKey = `water_${ws.kind}`;
        const thirstDrop = Math.min(agent.physical.thirst, 45);
        agent.physical.thirst = clamp(agent.physical.thirst - thirstDrop, 0, 100);
        agent.skills.waterFinding = clamp(agent.skills.waterFinding + 0.03, 0, 1);

        if (Math.random() < ws.contaminationRisk * (1 - agent.skills.waterFinding * 0.4)) {
          const ill = 18 + Math.random() * 18;
          agent.physical.illness = clamp(agent.physical.illness + ill, 0, 100);
          damages = ill;
          shortTermReward = thirstDrop * 0.015 - 0.7;
          longTermReward = -0.45;
          success = false;
          immediateOutcomeAr = `شرب من ${ws.kind} ملوث وأصيب بوعكة صحية.`;
        } else {
          if (agent.inventory.tools > 0 && agent.inventory.water < 4) {
            agent.inventory.water += 1;
            resourcesDelta.water = 1;
          }
          shortTermReward = thirstDrop * 0.05;
          longTermReward = 0.4;
          success = true;
          immediateOutcomeAr = `ارتوى من مصدر ماء نقي (${ws.kind}).`;
          this.addTimelineMilestone(
            'first_water_discovery',
            this.world.tick,
            agent.generation,
            'أول اكتشاف لمصدر مياه موثوق',
            `اكتشف ${agent.identity.name} مصدر مياه (${ws.kind}) وخفّض العطش بنجاح.`,
            agent.identity.id,
          );
          this.emitEvent({
            type: 'water',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: 'الوصول لمصدر مياه',
            detailAr: immediateOutcomeAr,
            severity: 'positive',
          });
        }
      } else {
        shortTermReward = -0.25;
        entityKey = 'water_absence';
        immediateOutcomeAr = 'فشل في العثور على مياه بهذا القطاع.';
      }
    } else if (action === 'hunt_prey') {
      category = 'hunting_method';
      recordCollective = true;
      const target = sector.animals.find((a) => a.count > 0);
      if (!target) {
        shortTermReward = -0.2;
        entityKey = 'no_prey_sector';
        immediateOutcomeAr = 'لم يعثر على حيوانات لصيدها.';
      } else {
        entityKey = `animal_${target.temperament}`;
        const allies = peers.filter(
          (p) => p.ageStage !== 'child' && (agent.relationships[p.identity.id]?.trust ?? 0) >= 0,
        );
        const coopBonus = Math.min(0.32, allies.length * 0.11);
        const toolBonus = agent.inventory.tools > 0 ? 0.16 : 0;
        const skillBonus = agent.skills.hunting * 0.32;
        const energyPenalty = agent.physical.energy < 25 ? -0.2 : 0;
        const successProb = clamp(
          0.35 + skillBonus + coopBonus + toolBonus + energyPenalty - target.difficulty * 0.4,
          0.08,
          0.92,
        );
        agent.physical.energy = clamp(agent.physical.energy - 11, 0, 100);
        agent.physical.fatigue = clamp(agent.physical.fatigue + 9, 0, 100);

        if (Math.random() < successProb) {
          target.count -= 1;
          consumedAmount = target.meatYield;
          const hungerDrop = Math.min(agent.physical.hunger, target.meatYield);
          agent.physical.hunger = clamp(agent.physical.hunger - hungerDrop, 0, 100);
          agent.inventory.food = Math.min(5, agent.inventory.food + 2);
          resourcesDelta.food = 2;
          agent.skills.hunting = clamp(agent.skills.hunting + 0.05, 0, 1);
          shortTermReward = 0.9 + hungerDrop * 0.03;
          longTermReward = 0.75 + (allies.length > 0 ? 0.4 : 0);
          success = true;
          immediateOutcomeAr = `نجح ${agent.identity.name} في صيد ${target.speciesKey}${allies.length > 0 ? ' بتعاون جماعي' : ''}.`;

          this.addTimelineMilestone(
            'first_hunt_success',
            this.world.tick,
            agent.generation,
            'أول صيد ناجح',
            `نجح ${agent.identity.name} في اصطياد ${target.speciesKey} عبر التجربة والمطاردة.`,
            agent.identity.id,
          );
          if (allies.length > 0) {
            agent.skills.cooperation = clamp(agent.skills.cooperation + 0.04, 0, 1);
            this.addTimelineMilestone(
              'first_cooperation',
              this.world.tick,
              agent.generation,
              'أول تعاون جماعي في الصيد',
              `تعاون ${agent.identity.name} مع أقرانه لإتمام مهمة صيد صعبة.`,
              agent.identity.id,
            );
          }
          this.emitEvent({
            type: 'hunt',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: 'نجاح عملية صيد',
            detailAr: immediateOutcomeAr,
            severity: 'positive',
          });
        } else {
          // Real injury risk from hunting predators or rough pursuit!
          if (Math.random() < target.dangerLevel) {
            const inj = 12 + Math.random() * 24;
            agent.physical.injury = clamp(agent.physical.injury + inj, 0, 100);
            agent.physical.health = clamp(agent.physical.health - inj * 0.35, 0, 100);
            damages = inj;
            shortTermReward = -0.95;
            longTermReward = -0.4;
            immediateOutcomeAr = `فشل الصيد وأصيب الصياد بجروح (${inj.toFixed(0)}%) أثناء مواجهة ${target.speciesKey}.`;
            this.emitEvent({
              type: 'injury',
              agentId: agent.identity.id,
              agentName: agent.identity.name,
              generation: agent.generation,
              sectorKey: sector.key,
              titleAr: 'إصابة أثناء الصيد',
              detailAr: immediateOutcomeAr,
              severity: 'warning',
            });
          } else {
            shortTermReward = -0.25;
            immediateOutcomeAr = `أفلتت الطريدة (${target.speciesKey}) بعد مطاردة فاشلة.`;
          }
          agent.skills.hunting = clamp(agent.skills.hunting + 0.015, 0, 1);
        }
      }
    } else if (action === 'observe_peer') {
      category = 'cooperation';
      const peer = peers[Math.floor(Math.random() * peers.length)];
      entityKey = 'social_observation';
      if (peer) {
        recordCollective = true;
        this.observationalLearnings += 1;
        this.collectiveMemory.totalKnowledgeExchanges += 1;
        // Transfer small skill boost & expose to peer's top knowledge/vocabulary (NOT full brain cloning!)
        const skillKeys = Object.keys(agent.skills) as Array<keyof AgentState['skills']>;
        let bestSkill: keyof AgentState['skills'] = 'foraging';
        for (const k of skillKeys) {
          if (peer.skills[k] > peer.skills[bestSkill]) bestSkill = k;
        }
        if (peer.skills[bestSkill] > agent.skills[bestSkill]) {
          agent.skills[bestSkill] = clamp(agent.skills[bestSkill] + 0.035, 0, 1);
        }
        // Adopt one knowledge reference by observation
        for (const kid of peer.knowledgeIds) {
          if (!agent.knowledgeIds.includes(kid)) {
            agent.knowledgeIds.push(kid);
            break;
          }
        }
        // Learn vocabulary by exposure
        for (const [mKey, entry] of Object.entries(peer.vocabulary)) {
          if (!agent.vocabulary[mKey]) {
            agent.vocabulary[mKey] = {
              symbol: entry.symbol,
              meaning: entry.meaning,
              confidence: 0.35,
              exposures: 1,
              firstHeardTick: this.world.tick,
            };
            this.collectiveMemory.recordOrReinforceSymbol(
              mKey,
              entry.meaning,
              entry.symbol,
              peer.identity.id,
              agent.generation,
              this.world.tick,
              true,
              true,
            );
            break;
          }
        }
        this.updateRelationship(agent, peer, 0.06, 0.05, true, false);
        agent.psychological.loneliness = Math.max(0, agent.psychological.loneliness - 10);
        shortTermReward = 0.25;
        longTermReward = 0.4;
        success = true;
        immediateOutcomeAr = `تعلّم ${agent.identity.name} بالملاحظة من ${peer.identity.name}.`;
        if (this.observationalLearnings % 25 === 1) {
          this.emitEvent({
            type: 'social_learning',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: 'تعلم اجتماعي بالمشاهدة',
            detailAr: immediateOutcomeAr,
            severity: 'info',
          });
        }
      } else {
        shortTermReward = -0.1;
        immediateOutcomeAr = 'لا يوجد أقران للمراقبة.';
      }
    } else if (action === 'cooperate_task') {
      category = 'cooperation';
      entityKey = 'method_group_cooperation';
      const partner = peers[0];
      if (partner) {
        recordCollective = true;
        agent.skills.cooperation = clamp(agent.skills.cooperation + 0.04, 0, 1);
        partner.skills.cooperation = clamp(partner.skills.cooperation + 0.03, 0, 1);
        this.updateRelationship(agent, partner, 0.12, 0.1, true, false);
        this.updateRelationship(partner, agent, 0.1, 0.09, true, false);
        agent.psychological.loneliness = Math.max(0, agent.psychological.loneliness - 14);
        agent.psychological.safetyFeeling = clamp(agent.psychological.safetyFeeling + 8, 0, 100);
        // Cooperative gathering/water haul yields mutual bonus
        if (sector.plantSupply >= 6) {
          sector.plantSupply -= 5;
          agent.inventory.food = Math.min(5, agent.inventory.food + 1);
          partner.inventory.food = Math.min(5, partner.inventory.food + 1);
          resourcesDelta.food = 1;
        }
        shortTermReward = 0.45;
        longTermReward = 0.55;
        success = true;
        immediateOutcomeAr = `نفّذ ${agent.identity.name} مهمة تعاونية ناجحة مع ${partner.identity.name}.`;
        this.addTimelineMilestone(
          'first_cooperation',
          this.world.tick,
          agent.generation,
          'أول تعاون منظم',
          `تعاون ${agent.identity.name} و${partner.identity.name} في جمع الموارد وبناء الثقة.`,
          agent.identity.id,
        );
      } else {
        shortTermReward = -0.15;
        immediateOutcomeAr = 'لا يوجد شركاء للتعاون.';
      }
    } else if (action === 'share_resource') {
      category = 'cooperation';
      entityKey = 'method_resource_sharing';
      const needyPeer = peers.sort(
        (a, b) => b.physical.hunger + b.physical.thirst - (a.physical.hunger + a.physical.thirst),
      )[0];
      if (needyPeer && (agent.inventory.food > 0 || agent.inventory.water > 0)) {
        recordCollective = true;
        if (agent.inventory.food > 0 && needyPeer.physical.hunger >= needyPeer.physical.thirst) {
          agent.inventory.food -= 1;
          needyPeer.physical.hunger = Math.max(0, needyPeer.physical.hunger - 26);
          resourcesDelta.food = -1;
        } else if (agent.inventory.water > 0) {
          agent.inventory.water -= 1;
          needyPeer.physical.thirst = Math.max(0, needyPeer.physical.thirst - 30);
          resourcesDelta.water = -1;
        }
        this.updateRelationship(agent, needyPeer, 0.18, 0.16, true, false);
        this.updateRelationship(needyPeer, agent, 0.22, 0.2, true, false);
        agent.psychological.morale = clamp(agent.psychological.morale + 10, 0, 100);
        shortTermReward = 0.35;
        longTermReward = 0.65;
        success = true;
        immediateOutcomeAr = `شارك ${agent.identity.name} الموارد مع ${needyPeer.identity.name} وعزز الثقة المتبادلة.`;
        this.emitEvent({
          type: 'sharing',
          agentId: agent.identity.id,
          agentName: agent.identity.name,
          generation: agent.generation,
          sectorKey: sector.key,
          titleAr: 'مشاركة طعام أو ماء',
          detailAr: immediateOutcomeAr,
          severity: 'positive',
        });
      } else {
        shortTermReward = -0.12;
        immediateOutcomeAr = 'لم تكتمل المشاركة لنقص المخزون أو عدم وجود محتاج.';
      }
    } else if (action === 'craft_attempt') {
      recordCollective = true;
      // Emergent open-ended innovation strictly from local materials & skill practice!
      const hasMats = sector.stoneSupply >= 4 && (sector.woodSupply >= 3 || sector.fiberSupply >= 3);
      if (!hasMats) {
        category = 'tool';
        entityKey = 'craft_insufficient_materials';
        shortTermReward = -0.15;
        immediateOutcomeAr = 'لا تتوفر مواد خام كافية في القطاع.';
      } else {
        sector.stoneSupply -= 3;
        sector.woodSupply = Math.max(0, sector.woodSupply - 2);
        sector.fiberSupply = Math.max(0, sector.fiberSupply - 2);
        agent.physical.energy = clamp(agent.physical.energy - 8, 0, 100);
        agent.skills.crafting = clamp(agent.skills.crafting + 0.045, 0, 1);

        const roll = Math.random();
        const mastery = agent.skills.crafting;
        if (roll < 0.22 + mastery * 0.55) {
          success = true;
          if (agent.inventory.tools < 2) {
            category = 'tool';
            entityKey = 'craft_primitive_stone_tool';
            agent.inventory.tools += 1;
            shortTermReward = 0.6;
            longTermReward = 0.7;
            immediateOutcomeAr = `نجح ${agent.identity.name} في تشكيل أداة حجرية بدائية.`;
            this.addTimelineMilestone(
              'first_tool',
              this.world.tick,
              agent.generation,
              'ابتكار أول أداة بدائية',
              `تمكن ${agent.identity.name} عبر المحاولة والخطأ من تشكيل أداة حجرية بدائية.`,
              agent.identity.id,
            );
          } else if (mastery > 0.3 && sector.sheltersBuilt < 3) {
            category = 'shelter';
            entityKey = 'craft_basic_shelter';
            sector.sheltersBuilt += 1;
            agent.skills.shelterBuilding = clamp(agent.skills.shelterBuilding + 0.08, 0, 1);
            shortTermReward = 0.7;
            longTermReward = 0.9;
            immediateOutcomeAr = `بنى ${agent.identity.name} مأوى بدائياً في القطاع ${sector.key}.`;
            this.addTimelineMilestone(
              'first_shelter',
              this.world.tick,
              agent.generation,
              'بناء أول مأوى بدائي',
              `أنشأ ${agent.identity.name} مأوى يحمي من قسوة المناخ.`,
              agent.identity.id,
            );
          } else if (mastery > 0.35 && sector.foodCaches < 4) {
            category = 'preservation';
            entityKey = 'craft_storage_cache';
            sector.foodCaches += 1;
            sector.waterCaches += 1;
            agent.skills.preservation = clamp(agent.skills.preservation + 0.08, 0, 1);
            shortTermReward = 0.65;
            longTermReward = 0.85;
            immediateOutcomeAr = `أنشأ ${agent.identity.name} موضعاً لحفظ الطعام والماء في ${sector.key}.`;
          } else if (mastery > 0.5 && sector.plantedPlots < 4) {
            category = 'proto_agriculture';
            entityKey = 'craft_plant_tending_plot';
            sector.plantedPlots += 1;
            agent.skills.protoAgriculture = clamp(agent.skills.protoAgriculture + 0.08, 0, 1);
            shortTermReward = 0.75;
            longTermReward = 1.1;
            immediateOutcomeAr = `بدأ ${agent.identity.name} برعاية بذور ونباتات محلية لتعزيز تجددها.`;
            this.addTimelineMilestone(
              'first_proto_agriculture',
              this.world.tick,
              agent.generation,
              'بدايات رعاية النباتات (زراعة أولية)',
              `لاحظ ${agent.identity.name} إمكانية رعاية النباتات وتكثيرها في القطاع ${sector.key}.`,
              agent.identity.id,
            );
          } else {
            category = 'tool';
            entityKey = 'craft_fiber_cordage';
            agent.inventory.materials += 1;
            resourcesDelta.materials = 1;
            shortTermReward = 0.45;
            longTermReward = 0.45;
            immediateOutcomeAr = 'شكّل حبالاً وأليافاً مساعدة.';
          }

          this.emitEvent({
            type: 'crafting',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: 'ابتكار وتصنيع بدائي',
            detailAr: immediateOutcomeAr,
            severity: 'positive',
          });
        } else {
          category = 'tool';
          entityKey = 'craft_failed_attempt';
          shortTermReward = -0.18;
          immediateOutcomeAr = 'تكسّر الحجر وفشلت محاولة التشكيل.';
        }
      }
    } else if (action === 'emit_signal') {
      category = 'signal_vocabulary';
      // Emergent communication grounded in local context
      const contextMeaning =
        sector.animals.some((a) => a.temperament === 'predator' && a.count > 0)
          ? { key: 'predator_warning', ar: 'تحذير من مفترس أو خطر' }
          : sector.waterSource
            ? { key: 'water_here', ar: 'إشارة إلى مصدر ماء' }
            : sector.plantSupply > 60
              ? { key: 'food_here', ar: 'إشارة إلى وفرة غذاء' }
              : { key: 'gather_help', ar: 'نداء للتجمع والتعاون' };

      const existingVocab = agent.vocabulary[contextMeaning.key];
      const token =
        existingVocab?.symbol ??
        EMERGENT_SIGNAL_POOL[
          Math.abs(contextMeaning.key.length * 7 + agent.generation) % EMERGENT_SIGNAL_POOL.length
        ];

      if (!existingVocab) {
        agent.vocabulary[contextMeaning.key] = {
          symbol: token,
          meaning: contextMeaning.ar,
          confidence: 0.4,
          exposures: 1,
          firstHeardTick: this.world.tick,
        };
      } else {
        existingVocab.exposures += 1;
        existingVocab.confidence = Math.min(1, existingVocab.confidence + 0.05);
      }

      agent.skills.signaling = clamp(agent.skills.signaling + 0.04, 0, 1);
      entityKey = `signal_${contextMeaning.key}`;

      if (peers.length > 0) {
        recordCollective = true;
        let adopters = 0;
        for (const peer of peers.slice(0, 4)) {
          if (Math.random() < 0.65) {
            adopters += 1;
            const hadIt = Boolean(peer.vocabulary[contextMeaning.key]);
            if (!hadIt) {
              peer.vocabulary[contextMeaning.key] = {
                symbol: token,
                meaning: contextMeaning.ar,
                confidence: 0.35,
                exposures: 1,
                firstHeardTick: this.world.tick,
              };
            } else {
              peer.vocabulary[contextMeaning.key].exposures += 1;
              peer.vocabulary[contextMeaning.key].confidence = Math.min(
                1,
                peer.vocabulary[contextMeaning.key].confidence + 0.07,
              );
            }
            this.collectiveMemory.recordOrReinforceSymbol(
              contextMeaning.key,
              contextMeaning.ar,
              token,
              agent.identity.id,
              agent.generation,
              this.world.tick,
              true,
              !hadIt,
            );
          }
        }
        success = adopters > 0;
        shortTermReward = adopters > 0 ? 0.35 : -0.05;
        longTermReward = adopters * 0.25;
        immediateOutcomeAr = `أصدر إشارة "${token}" (${contextMeaning.ar}) واستجاب لها ${adopters} أفراد.`;
        if (success) {
          this.addTimelineMilestone(
            'first_shared_signal',
            this.world.tick,
            agent.generation,
            'أول وسيلة تواصل مشتركة',
            `ارتبط الرمز الصوتي "${token}" بمعنى "${contextMeaning.ar}" عبر التفاعل بين الأفراد.`,
            agent.identity.id,
          );
        }
      } else {
        shortTermReward = -0.12;
        immediateOutcomeAr = `أصدر إشارة "${token}" دون مستمعين قريبين.`;
      }
    } else if (action === 'rest_sleep') {
      const sectorProtected = sector.sheltersBuilt > 0;
      const recoveryFactor = sectorProtected ? 1.35 : 1.0;
      const energyGain = Math.min(100 - agent.physical.energy, 30 * recoveryFactor);
      agent.physical.energy = clamp(agent.physical.energy + energyGain, 0, 100);
      agent.physical.fatigue = Math.max(0, agent.physical.fatigue - 32 * recoveryFactor);
      agent.physical.sleepNeed = Math.max(0, agent.physical.sleepNeed - 40 * recoveryFactor);
      agent.psychological.stress = Math.max(0, agent.psychological.stress - 12);
      success = energyGain > 6 || agent.physical.sleepNeed < 20;
      shortTermReward = success ? 0.25 : -0.1;
      entityKey = 'rest_recovery';
      immediateOutcomeAr = `استراح واستعاد ${energyGain.toFixed(0)} من الطاقة.`;
    } else if (action === 'tend_child') {
      const child = peers.find((p) => p.ageStage === 'child');
      if (child) {
        recordCollective = true;
        if (agent.inventory.food > 0) {
          agent.inventory.food -= 1;
          child.physical.hunger = Math.max(0, child.physical.hunger - 28);
        }
        child.physical.health = clamp(child.physical.health + 6, 0, 100);
        child.psychological.safetyFeeling = clamp(child.psychological.safetyFeeling + 14, 0, 100);
        this.updateRelationship(agent, child, 0.2, 0.2, true, false);
        this.updateRelationship(child, agent, 0.25, 0.25, true, false);
        shortTermReward = 0.4;
        longTermReward = 0.7;
        success = true;
        entityKey = 'child_care';
        immediateOutcomeAr = `رعى الطفل ${child.identity.name} ودعّم بقاءه.`;
      } else {
        shortTermReward = -0.1;
        entityKey = 'no_child_nearby';
        immediateOutcomeAr = 'لا يوجد أطفال قريبون للرعاية.';
      }
    } else if (action === 'reconcile_or_bond') {
      const peer = peers[Math.floor(Math.random() * peers.length)];
      if (peer) {
        recordCollective = true;
        const rel = agent.relationships[peer.identity.id];
        if (rel && rel.trust < -0.1) {
          this.updateRelationship(agent, peer, 0.25, 0.2, true, false);
          this.updateRelationship(peer, agent, 0.22, 0.18, true, false);
          immediateOutcomeAr = `تمت مصالحة بين ${agent.identity.name} و${peer.identity.name}.`;
          this.emitEvent({
            type: 'reconciliation',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: 'مصالحة اجتماعية',
            detailAr: immediateOutcomeAr,
            severity: 'positive',
          });
        } else if (Math.random() < 0.12 && agent.psychological.stress > 55) {
          // Occasional realistic resource/social conflict
          this.updateRelationship(agent, peer, -0.22, -0.2, false, true);
          this.updateRelationship(peer, agent, -0.22, -0.2, false, true);
          shortTermReward = -0.25;
          immediateOutcomeAr = `نشب نزاع عابر بين ${agent.identity.name} و${peer.identity.name}.`;
          this.emitEvent({
            type: 'conflict',
            agentId: agent.identity.id,
            agentName: agent.identity.name,
            generation: agent.generation,
            sectorKey: sector.key,
            titleAr: 'نزاع اجتماعي',
            detailAr: immediateOutcomeAr,
            severity: 'warning',
          });
          return {
            success: false,
            shortTermReward,
            longTermReward: -0.1,
            damages: 0,
            consumedAmount: 0,
            resourcesDelta,
            entityKey: 'social_conflict',
            category: 'cooperation',
            immediateOutcomeAr,
            recordCollective,
          };
        } else {
          this.updateRelationship(agent, peer, 0.12, 0.14, true, false);
          this.updateRelationship(peer, agent, 0.1, 0.12, true, false);
          immediateOutcomeAr = `تعززت الصداقة والثقة مع ${peer.identity.name}.`;
        }
        agent.psychological.loneliness = Math.max(0, agent.psychological.loneliness - 16);
        agent.psychological.morale = clamp(agent.psychological.morale + 7, 0, 100);
        shortTermReward = 0.3;
        longTermReward = 0.35;
        success = true;
        entityKey = 'social_bonding';
      } else {
        shortTermReward = -0.1;
        entityKey = 'alone_bond_fail';
        immediateOutcomeAr = 'لا يوجد أقران للتواصل الاجتماعي.';
      }
    } else if (action === 'treat_ailment') {
      category = 'health_remedy';
      recordCollective = true;
      agent.skills.healing = clamp(agent.skills.healing + 0.04, 0, 1);
      const healAmt = 10 + agent.skills.healing * 20;
      if (agent.physical.injury > 0 || agent.physical.illness > 0 || agent.physical.poison > 0) {
        agent.physical.injury = Math.max(0, agent.physical.injury - healAmt);
        agent.physical.illness = Math.max(0, agent.physical.illness - healAmt * 0.8);
        agent.physical.poison = Math.max(0, agent.physical.poison - healAmt * 0.6);
        agent.physical.health = clamp(agent.physical.health + healAmt * 0.4, 0, 100);
        shortTermReward = 0.45;
        longTermReward = 0.5;
        success = true;
        entityKey = 'health_self_care';
        immediateOutcomeAr = `عالج إصاباته/مرضه وحسّن حالته الصحية.`;
      } else {
        shortTermReward = -0.05;
        entityKey = 'health_unneeded';
        immediateOutcomeAr = 'الحالة الجسدية لا تستدعي علاجاً.';
      }
    } else if (action === 'move_sector' || action === 'explore') {
      // Move toward adjacent sector (weighted by scarcity vs exploration)
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      const [dx, dy] = dirs[Math.floor(Math.random() * dirs.length)];
      const nx = clamp(agent.sectorX + dx, 0, GRID_SIZE - 1);
      const ny = clamp(agent.sectorY + dy, 0, GRID_SIZE - 1);
      agent.sectorX = nx;
      agent.sectorY = ny;
      agent.physical.energy = clamp(agent.physical.energy - 3.5, 0, 100);
      const newSec = this.getSector(nx, ny);
      const foundNewResources =
        (agent.physical.thirst > 45 && newSec.waterSource !== null) ||
        (agent.physical.hunger > 45 && newSec.plantSupply > 90);
      success = foundNewResources || action === 'explore';
      shortTermReward = foundNewResources ? 0.35 : 0.05;
      entityKey = `sector_${newSec.biome}`;
      immediateOutcomeAr = `انتقل واستكشف القطاع ${newSec.key} (${newSec.biome}).`;
      if (foundNewResources && !agent.longTermMemory.preferredSectors.includes(newSec.key)) {
        agent.longTermMemory.preferredSectors.push(newSec.key);
        if (agent.longTermMemory.preferredSectors.length > 8) {
          agent.longTermMemory.preferredSectors.shift();
        }
      }
    }

    return {
      success,
      shortTermReward,
      longTermReward,
      damages,
      consumedAmount,
      resourcesDelta,
      entityKey,
      category,
      immediateOutcomeAr,
      recordCollective,
    };
  }

  private updateRelationship(
    agent: AgentState,
    target: AgentState,
    trustDelta: number,
    affinityDelta: number,
    isCoop: boolean,
    isConflict: boolean,
  ): void {
    let rel = agent.relationships[target.identity.id];
    if (!rel) {
      rel = {
        targetId: target.identity.id,
        trust: 0,
        affinity: 0,
        interactions: 0,
        cooperations: 0,
        conflicts: 0,
        lastTick: this.world.tick,
      };
      agent.relationships[target.identity.id] = rel;
    }
    rel.trust = clamp(rel.trust + trustDelta, -1, 1);
    rel.affinity = clamp(rel.affinity + affinityDelta, -1, 1);
    rel.interactions += 1;
    if (isCoop) rel.cooperations += 1;
    if (isConflict) rel.conflicts += 1;
    rel.lastTick = this.world.tick;
  }

  private attemptNaturalReproduction(
    agent: AgentState,
    peers: AgentState[],
    newBabies: AgentState[],
  ): void {
    if (
      agent.sex !== 'female' ||
      agent.ageStage !== 'adult' ||
      agent.gestationCooldown > 0 ||
      agent.physical.health < 65 ||
      agent.physical.hunger > 50 ||
      agent.physical.thirst > 50 ||
      agent.physical.energy < 45
    ) {
      return;
    }
    // Carrying capacity safeguard for CPU/RAM stability only at very high population while allowing realistic growth
    const aliveCount = this.agents.filter((a) => a.alive).length + newBabies.length;
    if (aliveCount >= 260) return;

    const mate = peers.find(
      (p) =>
        p.sex === 'male' &&
        p.ageStage === 'adult' &&
        p.physical.health > 55 &&
        p.physical.hunger < 60 &&
        (agent.relationships[p.identity.id]?.trust ?? 0) >= 0.05,
    );
    if (!mate) return;

    if (Math.random() < 0.045) {
      const babyGen = Math.max(agent.generation, mate.generation) + 1;
      if (babyGen > this.currentGeneration) {
        this.currentGeneration = babyGen;
      }
      const baby = createAgent({
        serialIndex: this.serialCounter++,
        generation: babyGen,
        birthTick: this.world.tick,
        originType: 'natural_birth',
        ageStage: 'child',
        sectorX: agent.sectorX,
        sectorY: agent.sectorY,
        parentA: agent,
        parentB: mate,
      });
      agent.offspringCount += 1;
      mate.offspringCount += 1;
      agent.gestationCooldown = 48;
      agent.physical.energy = clamp(agent.physical.energy - 18, 0, 100);
      this.updateRelationship(agent, baby, 0.5, 0.6, true, false);
      this.updateRelationship(baby, agent, 0.5, 0.6, true, false);
      newBabies.push(baby);

      this.emitEvent({
        type: 'birth',
        agentId: baby.identity.id,
        agentName: baby.identity.name,
        generation: babyGen,
        sectorKey: `${baby.sectorX},${baby.sectorY}`,
        titleAr: `ولادة فرد جديد: ${baby.identity.name}`,
        detailAr: `وُلد في الجيل ${babyGen} لأبوين (${agent.identity.name} و${mate.identity.name}) بعقل مستقل غير مستنسخ.`,
        severity: 'positive',
      });
    }
  }

  private extractActiveNeeds(agent: AgentState): string[] {
    const needs: string[] = [];
    if (agent.physical.hunger > 45) needs.push('طعام');
    if (agent.physical.thirst > 45) needs.push('ماء');
    if (agent.physical.health < 65) needs.push('عناية صحية');
    if (agent.physical.sleepNeed > 60) needs.push('نوم وراحة');
    if (agent.psychological.loneliness > 55) needs.push('تفاعل اجتماعي');
    if (needs.length === 0) needs.push('استكشاف وتعلم');
    return needs;
  }

  private updateGenerationMetrics(): void {
    for (const gen of this.generationsMap.values()) {
      const members = this.agents.filter((a) => a.generation === gen.generation);
      if (members.length === 0) continue;
      gen.totalAgents = members.length;
      gen.aliveCount = members.filter((m) => m.alive).length;
      const totalLife = members.reduce((s, m) => s + m.ageTicks, 0);
      const totalReward = members.reduce((s, m) => s + m.rlStats.totalReward, 0);
      const totalSkills = members.reduce(
        (s, m) => s + Object.values(m.skills).reduce((a, b) => a + b, 0),
        0,
      );
      const reachedAdult = members.filter((m) => m.ageTicks >= 60 || m.alive).length;
      const totalOffspring = members.reduce((s, m) => s + m.offspringCount, 0);

      gen.avgLifespanTicks = Number((totalLife / members.length).toFixed(1));
      gen.avgReward = Number((totalReward / members.length).toFixed(2));
      gen.avgSkillTotal = Number((totalSkills / members.length).toFixed(2));
      gen.childSurvivalRate = Number((reachedAdult / members.length).toFixed(3));
      gen.avgOffspring = Number((totalOffspring / members.length).toFixed(2));
      gen.knowledgeDiscoveredCount = this.collectiveMemory
        .getKnowledgeArray()
        .filter((k) => k.discovererGeneration === gen.generation).length;
    }
  }

  private computeExtinctionRisk(): ExtinctionRiskLevel {
    const alive = this.agents.filter((a) => a.alive);
    if (alive.length === 0) return 'total_extinction';
    if (alive.length <= 5) return 'near_extinction';
    if (alive.length <= 18) return 'critical';
    if (alive.length < 55) return 'decline';
    return 'stable';
  }

  private monitorExtinctionAndCrises(): void {
    const alive = this.agents.filter((a) => a.alive);
    const risk = this.computeExtinctionRisk();
    this.crisisDiagnosticsAr = [];

    if (risk === 'decline' || risk === 'critical' || risk === 'near_extinction') {
      const avgHunger = alive.reduce((s, a) => s + a.physical.hunger, 0) / Math.max(1, alive.length);
      const avgThirst = alive.reduce((s, a) => s + a.physical.thirst, 0) / Math.max(1, alive.length);
      const totalPlants = this.world.sectors.reduce((s, sec) => s + sec.plantSupply, 0);
      const totalWater = this.world.sectors.reduce((s, sec) => s + (sec.waterSource?.volume ?? 0), 0);

      if (avgHunger > 65 || totalPlants < 1500) {
        this.crisisDiagnosticsAr.push('نقص حاد في الغذاء أو إجهاد النباتات في عدة قطاعات');
      }
      if (avgThirst > 65 || totalWater < 3000) {
        this.crisisDiagnosticsAr.push('شح مصادر المياه النقية أو ارتفاع الجفاف الموسمي');
      }
      if (alive.filter((a) => a.ageStage === 'adult').length < 4) {
        this.crisisDiagnosticsAr.push('انخفاض حرج في عدد البالغين القادرين على التكاثر');
      }
      if (this.crisisDiagnosticsAr.length === 0) {
        this.crisisDiagnosticsAr.push('ارتفاع معدل الوفيات بسبب المخاطر البيئية والتسمم أو الإصابات');
      }

      if (risk === 'critical' && this.world.tick % 20 === 0) {
        this.emitEvent({
          type: 'crisis',
          generation: this.currentGeneration,
          titleAr: 'إنذار أزمة سكانية حرجة',
          detailAr: `انخفض السكان إلى ${alive.length} فرد. الأسباب المرصودة: ${this.crisisDiagnosticsAr.join('، ')}.`,
          severity: 'critical',
        });
      }
    }

    if (alive.length === 0 && this.pendingRecoveryAtTick === null) {
      // Steps 1-6 of Extinction Protocol immediately upon reaching 0
      const totalPlants = this.world.sectors.reduce((s, sec) => s + sec.plantSupply, 0);
      const totalWater = this.world.sectors.reduce((s, sec) => s + (sec.waterSource?.volume ?? 0), 0);
      const totalAnimals = this.world.sectors.reduce(
        (s, sec) => s + sec.animals.reduce((x, y) => x + y.count, 0),
        0,
      );

      const causesMap: Record<string, number> = {};
      for (const a of this.agents) {
        if (a.causeOfDeath) causesMap[a.causeOfDeath] = (causesMap[a.causeOfDeath] ?? 0) + 1;
      }
      const rootCausesAr = Object.entries(causesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([cause, count]) => `${cause} (${count} حالة)`);

      const extRecord: ExtinctionRecord = {
        id: `ext_${this.world.tick}_${this.extinctionRecords.length + 1}`,
        tick: this.world.tick,
        timestamp: new Date().toISOString(),
        generationAtExtinction: this.currentGeneration,
        extinctPopulationCount: this.agents.length,
        rootCausesAr: rootCausesAr.length > 0 ? rootCausesAr : ['انهيار البقاء الجماعي'],
        resourceSnapshot: {
          totalPlants: Math.round(totalPlants),
          totalWater: Math.round(totalWater),
          totalAnimals,
        },
        preservedExperienceCount: this.collectiveMemory.experiences.length,
        preservedKnowledgeCount: this.collectiveMemory.knowledgeMap.size,
        preservedBrainCount: this.preservedRevivalPool.length,
        recoveryAttempted: false,
      };
      this.extinctionRecords.push(extRecord);
      this.simStatus = 'recovering';

      this.addTimelineMilestone(
        `extinction_${this.extinctionRecords.length}`,
        this.world.tick,
        this.currentGeneration,
        `انقراض جماعي #${this.extinctionRecords.length}`,
        `انقرض السكان عند الجيل ${this.currentGeneration}. تم حفظ ${extRecord.preservedExperienceCount} تجربة و${extRecord.preservedKnowledgeCount} معرفة للخط الزمني الأصلي.`,
      );

      this.emitEvent({
        type: 'extinction',
        generation: this.currentGeneration,
        titleAr: 'حدث انقراض جماعي — تفعيل بروتوكول الحفظ والاستمرارية',
        detailAr: `وصل السكان إلى صفر. حُفظت قاعدة التجارب والمعرفة وأوزان العقول. الأسباب: ${extRecord.rootCausesAr.join('، ')}.`,
        severity: 'critical',
      });

      this.pendingRecoveryAtTick = this.world.tick + 2;
    }
  }

  public executeExtinctionRecovery(forcedPolicy?: RecoveryPolicyMode): RecoveryEvent | null {
    const policy = forcedPolicy ?? this.recoveryPolicy;
    if (this.consecutiveFailedRecoveries >= MAX_CONSECUTIVE_FAILED_RECOVERIES) {
      this.simStatus = 'paused';
      this.emitEvent({
        type: 'crisis',
        generation: this.currentGeneration,
        titleAr: 'تعليق الاستعادة مؤقتاً لمنع حلقة فشل لانهائية',
        detailAr: `فشلت ${MAX_CONSECUTIVE_FAILED_RECOVERIES} محاولات استعادة متتالية؛ تم إيقاف التكرار التلقائي وحفظ الحالة للمراجعة.`,
        severity: 'critical',
      });
      this.pendingRecoveryAtTick = null;
      return null;
    }

    const latestExt = this.extinctionRecords[this.extinctionRecords.length - 1];
    const extinctionId = latestExt?.id ?? `ext_manual_${this.world.tick}`;
    const newGen = this.currentGeneration + 1;
    this.currentGeneration = newGen;
    const attemptNumber = this.consecutiveFailedRecoveries + 1;
    this.lastRecoveryAttemptTick = this.world.tick;
    this.pendingRecoveryAtTick = null;

    let restoredCount = 0;
    let notesAr = '';

    if (policy === 'revive_preserved_individuals' && this.preservedRevivalPool.length > 0) {
      // Revive original preserved individuals keeping their exact identity, personal memory & weights
      const toRevive = this.preservedRevivalPool.slice(0, 40);
      for (const saved of toRevive) {
        const clone: AgentState = JSON.parse(JSON.stringify(saved)) as AgentState;
        clone.alive = true;
        clone.deathTick = undefined;
        clone.causeOfDeath = undefined;
        clone.identity.originType = 'recovery_revived';
        clone.physical.health = 85;
        clone.physical.hunger = 20;
        clone.physical.thirst = 20;
        clone.physical.energy = 80;
        clone.physical.poison = 0;
        clone.physical.injury = 0;
        clone.physical.illness = 0;
        this.agents.push(clone);
        this.restoredBrainsCount += 1;
        restoredCount += 1;
      }
      notesAr = `استعادة ${restoredCount} فرداً محفوظاً بهوياتهم وذاكرتهم وأوزانهم العصبية الأصلية دون محو التاريخ السابق.`;
    } else {
      // Spawn new generation with fresh independent brains & access to collective knowledge
      const spawnCount = 60;
      this.ensureGenerationEntry(newGen, this.world.tick);
      for (let i = 0; i < spawnCount; i++) {
        const newAgent = createAgent({
          serialIndex: this.serialCounter++,
          generation: newGen,
          birthTick: this.world.tick,
          originType: 'recovery_new',
          ageStage: 'adult',
        });
        this.agents.push(newAgent);
        const gen = this.generationsMap.get(newGen)!;
        gen.totalAgents += 1;
        gen.aliveCount += 1;
        restoredCount += 1;
      }
      notesAr = `إطلاق الجيل ${newGen} بـ ${restoredCount} فرداً جديداً بعقول مستقلة وإتاحة قاعدة التجارب والمعرفة التراكمية السابقة.`;
    }

    const recoveryEvt: RecoveryEvent = {
      id: `rec_${this.world.tick}_${this.recoveryEvents.length + 1}`,
      tick: this.world.tick,
      timestamp: new Date().toISOString(),
      extinctionId,
      policy,
      attemptNumber,
      success: restoredCount > 0,
      newGenerationNumber: newGen,
      restoredAgentsCount: restoredCount,
      notesAr,
    };
    this.recoveryEvents.push(recoveryEvt);
    if (latestExt) {
      latestExt.recoveryAttempted = true;
      latestExt.recoveryId = recoveryEvt.id;
    }

    if (recoveryEvt.success) {
      this.consecutiveFailedRecoveries = 0;
      this.simStatus = 'running';
      this.addTimelineMilestone(
        `recovery_${this.recoveryEvents.length}`,
        this.world.tick,
        newGen,
        `استعادة الحضارة (الجيل ${newGen})`,
        notesAr,
      );
      this.emitEvent({
        type: 'recovery',
        generation: newGen,
        titleAr: `اكتمال بروتوكول استعادة الحضارة (الجيل ${newGen})`,
        detailAr: notesAr,
        severity: 'positive',
      });
    } else {
      this.consecutiveFailedRecoveries += 1;
    }

    return recoveryEvt;
  }

  public triggerControlledExtinctionForTest(): void {
    const alive = this.agents.filter((a) => a.alive);
    for (const a of alive) {
      this.killAgent(a, 'اختبار محاكاة أزمة الانقراض والاستعادة');
    }
    this.monitorExtinctionAndCrises();
  }

  public promoteVerifiedPackage(pkg: BrainPackage): AgentState {
    const agent = createAgent({
      serialIndex: this.serialCounter++,
      generation: this.currentGeneration,
      birthTick: this.world.tick,
      originType: 'isolated_promoted',
      ageStage: 'adult',
      customName: `${pkg.identityTemplate.suggestedName}`,
    });
    agent.brain = JSON.parse(JSON.stringify(pkg.weights)) as AgentState['brain'];
    agent.personality = { ...pkg.identityTemplate.personality };
    agent.identity.geneticTraits = { ...pkg.identityTemplate.geneticTraits };
    agent.skills = { ...pkg.learnedSkills };
    agent.knowledgeIds = [...pkg.knowledgeRefs];
    agent.episodicMemory = JSON.parse(JSON.stringify(pkg.memoryState.slice(-20)));
    this.agents.push(agent);

    const gen = this.ensureGenerationEntry(this.currentGeneration, this.world.tick);
    gen.totalAgents += 1;
    gen.aliveCount += 1;

    this.emitEvent({
      type: 'training_promotion',
      agentId: agent.identity.id,
      agentName: agent.identity.name,
      generation: agent.generation,
      sectorKey: `${agent.sectorX},${agent.sectorY}`,
      titleAr: `دمج عقل مدرب في الحضارة: ${agent.identity.name}`,
      detailAr: `اجتازت الحزمة ${pkg.packageId} جميع فحوصات التوافق والسلامة (Hash: ${pkg.integrityHash.slice(0, 12)}…) ودخلت العالم الرئيسي.`,
      severity: 'positive',
    });

    return agent;
  }

  private recordHistorySnapshot(): void {
    const alive = this.agents.filter((a) => a.alive);
    const n = Math.max(1, alive.length);
    const avgHealth = alive.reduce((s, a) => s + a.physical.health, 0) / n;
    const avgHunger = alive.reduce((s, a) => s + a.physical.hunger, 0) / n;
    const avgThirst = alive.reduce((s, a) => s + a.physical.thirst, 0) / n;
    const avgReward =
      this.agents.reduce((s, a) => s + a.rlStats.totalReward, 0) / Math.max(1, this.agents.length);
    const retentionScore =
      alive.reduce((s, a) => s + a.rlStats.retentionScore, 0) / n;
    const totalPlants = this.world.sectors.reduce((s, sec) => s + sec.plantSupply, 0);
    const totalWater = this.world.sectors.reduce(
      (s, sec) => s + (sec.waterSource?.volume ?? 0),
      0,
    );

    this.history.push({
      tick: this.world.tick,
      alive: alive.length,
      birthsCumulative: this.birthsCount,
      deathsCumulative: this.deathsCount,
      avgHealth: Number(avgHealth.toFixed(1)),
      avgHunger: Number(avgHunger.toFixed(1)),
      avgThirst: Number(avgThirst.toFixed(1)),
      avgReward: Number(avgReward.toFixed(2)),
      retentionScore: Number(retentionScore.toFixed(3)),
      forgettingRate: Number((1 - retentionScore).toFixed(3)),
      totalPlants: Math.round(totalPlants),
      totalWater: Math.round(totalWater),
      knowledgeCount: this.collectiveMemory.knowledgeMap.size,
      symbolsCount: this.collectiveMemory.symbolsMap.size,
    });

    if (this.history.length > MAX_HISTORY_POINTS) {
      this.history.shift();
    }
  }

  public getBenchmarks(): PerformanceBenchmarks {
    const cpu = process.cpuUsage();
    const mem = process.memoryUsage();
    return {
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
      rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
      heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
      lastDecisionDurationMs: this.lastDecisionDurationMs,
      decisionsPerSecond: this.decisionsPerSecond,
      experienceDbCount: this.collectiveMemory.experiences.length,
      experienceRecallTimeMs: this.experienceRecallTimeMs,
      latestCheckpointBytes: this.latestCheckpointBytes,
      sqliteDbBytes: this.sqliteDbBytes,
    };
  }

  public buildTelemetrySnapshot(): TelemetrySnapshot {
    const alive = this.agents.filter((a) => a.alive);
    const deceased = this.agents.length - alive.length;
    const nAlive = Math.max(1, alive.length);
    const nAll = Math.max(1, this.agents.length);

    const sectorOccupancy: Record<string, number> = {};
    for (const a of alive) {
      const k = `${a.sectorX},${a.sectorY}`;
      sectorOccupancy[k] = (sectorOccupancy[k] ?? 0) + 1;
    }

    const totalDecisions = this.agents.reduce((s, a) => s + a.rlStats.totalDecisions, 0);
    const totalSuccess = this.agents.reduce((s, a) => s + a.rlStats.successfulActions, 0);
    const totalFail = this.agents.reduce((s, a) => s + a.rlStats.failedActions, 0);
    const totalReward = this.agents.reduce((s, a) => s + a.rlStats.totalReward, 0);
    const totalTrainingSteps = this.agents.reduce((s, a) => s + a.brain.trainingSteps, 0);
    const avgPredictionAccuracy =
      alive.reduce((s, a) => s + a.brain.predictionAccuracy, 0) / nAlive;
    const avgRetention = alive.reduce((s, a) => s + a.rlStats.retentionScore, 0) / nAlive;
    const rewardHackingFlags = this.agents.reduce((s, a) => s + a.rlStats.rewardHackingFlags, 0);

    // Strategy diversity: distinct dominant last actions across alive agents / total actions
    const actionDist = new Set(alive.map((a) => a.lastAction).filter(Boolean));
    const strategyDiversity = Number((actionDist.size / AGENT_ACTIONS.length).toFixed(3));

    // Social metrics
    let totalRels = 0;
    let posRels = 0;
    let negRels = 0;
    let totalCoops = 0;
    let totalConflicts = 0;
    for (const a of alive) {
      for (const r of Object.values(a.relationships)) {
        totalRels += 1;
        if (r.trust >= 0.1) posRels += 1;
        if (r.trust <= -0.1) negRels += 1;
        totalCoops += r.cooperations;
        totalConflicts += r.conflicts;
      }
    }
    const formedGroups = Math.floor(
      Object.values(sectorOccupancy).filter((c) => c >= 3).length,
    );

    // Causes of death
    const causesOfDeath: Record<string, number> = {};
    for (const a of this.agents) {
      if (!a.alive && a.causeOfDeath) {
        causesOfDeath[a.causeOfDeath] = (causesOfDeath[a.causeOfDeath] ?? 0) + 1;
      }
    }

    const childrenList = this.agents.filter((a) => a.generation > 1);
    const survivedChildren = childrenList.filter((a) => a.alive || a.ageTicks >= 60).length;
    const unmetCount = alive.filter(
      (a) => a.physical.hunger > 65 || a.physical.thirst > 65 || a.physical.health < 45,
    ).length;

    const totalPlants = this.world.sectors.reduce((s, sec) => s + sec.plantSupply, 0);
    const totalWater = this.world.sectors.reduce((s, sec) => s + (sec.waterSource?.volume ?? 0), 0);
    const totalAnimals = this.world.sectors.reduce(
      (s, sec) => s + sec.animals.reduce((x, y) => x + y.count, 0),
      0,
    );

    const agentsSummary: AgentSummaryView[] = this.agents.map((a) => {
      const totalAct = a.rlStats.successfulActions + a.rlStats.failedActions;
      return {
        id: a.identity.id,
        name: a.identity.name,
        generation: a.generation,
        ageTicks: a.ageTicks,
        ageStage: a.ageStage,
        sex: a.sex,
        alive: a.alive,
        causeOfDeath: a.causeOfDeath,
        sectorKey: `${a.sectorX},${a.sectorY}`,
        hunger: Number(a.physical.hunger.toFixed(1)),
        thirst: Number(a.physical.thirst.toFixed(1)),
        health: Number(a.physical.health.toFixed(1)),
        energy: Number(a.physical.energy.toFixed(1)),
        stress: Number(a.psychological.stress.toFixed(1)),
        totalReward: Number(a.rlStats.totalReward.toFixed(2)),
        totalDecisions: a.rlStats.totalDecisions,
        actionSuccessRate: totalAct > 0 ? Number((a.rlStats.successfulActions / totalAct).toFixed(3)) : 0,
        retentionScore: a.rlStats.retentionScore,
        forgettingRate: a.rlStats.forgettingRate,
        skillsSum: Number(
          Object.values(a.skills)
            .reduce((x, y) => x + y, 0)
            .toFixed(2),
        ),
        knowledgeCount: a.knowledgeIds.length,
        vocabularyCount: Object.keys(a.vocabulary).length,
        relationshipsCount: Object.keys(a.relationships).length,
        offspringCount: a.offspringCount,
        lastAction: a.lastAction,
        lastActionOutcome: a.lastActionOutcome,
        originType: a.identity.originType,
      };
    });

    const latestCp = this.checkpoints[0];

    return {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      runId: this.world.runId,
      serverTime: new Date().toISOString(),
      simStatus: this.simStatus,
      speedMultiplier: this.speedMultiplier,
      elapsedRealSeconds: Number(this.elapsedRealSeconds.toFixed(1)),
      tick: this.world.tick,
      worldDays: this.world.worldDays,
      currentGeneration: this.currentGeneration,
      recoveryPolicy: this.recoveryPolicy,

      population: {
        totalCreated: this.agents.length,
        alive: alive.length,
        deceased,
        births: this.birthsCount,
        deaths: this.deathsCount,
        children: alive.filter((a) => a.ageStage === 'child').length,
        adults: alive.filter((a) => a.ageStage === 'adult').length,
        elders: alive.filter((a) => a.ageStage === 'elder').length,
        females: alive.filter((a) => a.sex === 'female').length,
        males: alive.filter((a) => a.sex === 'male').length,
        reproductionCapable: alive.filter(
          (a) => a.ageStage === 'adult' && a.physical.health > 55 && a.gestationCooldown === 0,
        ).length,
        birthRatePer100Ticks:
          this.world.tick > 0 ? Number(((this.birthsCount / this.world.tick) * 100).toFixed(2)) : 0,
        deathRatePer100Ticks:
          this.world.tick > 0 ? Number(((this.deathsCount / this.world.tick) * 100).toFixed(2)) : 0,
        avgLifespanTicks: Number(
          (this.agents.reduce((s, a) => s + a.ageTicks, 0) / nAll).toFixed(1),
        ),
        reproductionRate: Number(
          (this.agents.reduce((s, a) => s + a.offspringCount, 0) / nAll).toFixed(2),
        ),
        childSurvivalRate:
          childrenList.length > 0 ? Number((survivedChildren / childrenList.length).toFixed(3)) : 1,
        avgOffspring: Number(
          (this.agents.reduce((s, a) => s + a.offspringCount, 0) / nAll).toFixed(2),
        ),
        avgHealth: Number((alive.reduce((s, a) => s + a.physical.health, 0) / nAlive).toFixed(1)),
        avgHunger: Number((alive.reduce((s, a) => s + a.physical.hunger, 0) / nAlive).toFixed(1)),
        avgThirst: Number((alive.reduce((s, a) => s + a.physical.thirst, 0) / nAlive).toFixed(1)),
        avgEnergy: Number((alive.reduce((s, a) => s + a.physical.energy, 0) / nAlive).toFixed(1)),
        sectorOccupancy,
      },

      mindsAndLearning: {
        activeBrains: alive.length,
        savedBrains: this.preservedRevivalPool.length,
        deceasedBrains: deceased,
        restoredBrains: this.restoredBrainsCount,
        neuralNetworksCount: this.agents.length,
        totalTrainingSteps,
        totalExperiencesRecorded: this.collectiveMemory.totalExperiencesRecorded,
        totalExperiencesReplayed: this.collectiveMemory.totalExperiencesReplayed,
        experienceDbSize: this.collectiveMemory.experiences.length,
        totalDecisions,
        totalReward: Number(totalReward.toFixed(2)),
        avgReward: Number((totalReward / nAll).toFixed(2)),
        actionSuccessRate:
          totalSuccess + totalFail > 0
            ? Number((totalSuccess / (totalSuccess + totalFail)).toFixed(3))
            : 0,
        actionFailureRate:
          totalSuccess + totalFail > 0
            ? Number((totalFail / (totalSuccess + totalFail)).toFixed(3))
            : 0,
        predictionAccuracy: Number(avgPredictionAccuracy.toFixed(3)),
        avgRetentionScore: Number(avgRetention.toFixed(3)),
        avgForgettingRate: Number((1 - avgRetention).toFixed(3)),
        strategyDiversity,
        rewardHackingFlags,
      },

      environment: {
        areaKm2: this.world.areaKm2,
        season: this.world.season,
        temperatureC: Number(this.world.temperatureC.toFixed(1)),
        rainfall: Number(this.world.rainfall.toFixed(2)),
        climateStress: Number(this.world.climateStress.toFixed(2)),
        totalPlants: Math.round(totalPlants),
        totalWater: Math.round(totalWater),
        totalAnimals,
        totalStone: Math.round(this.world.sectors.reduce((s, sec) => s + sec.stoneSupply, 0)),
        totalWood: Math.round(this.world.sectors.reduce((s, sec) => s + sec.woodSupply, 0)),
        totalFiber: Math.round(this.world.sectors.reduce((s, sec) => s + sec.fiberSupply, 0)),
        sheltersBuilt: this.world.sectors.reduce((s, sec) => s + sec.sheltersBuilt, 0),
        foodCaches: this.world.sectors.reduce((s, sec) => s + sec.foodCaches, 0),
        waterCaches: this.world.sectors.reduce((s, sec) => s + sec.waterCaches, 0),
        plantedPlots: this.world.sectors.reduce((s, sec) => s + sec.plantedPlots, 0),
        consumptionRate: Number(this.lastConsumptionEstimate.toFixed(1)),
        regenerationRate: Number(this.lastRegenerationEstimate.toFixed(1)),
        sectors: this.world.sectors.map((sec) => ({
          key: sec.key,
          x: sec.x,
          y: sec.y,
          biome: sec.biome,
          plantSupply: Math.round(sec.plantSupply),
          waterVolume: Math.round(sec.waterSource?.volume ?? 0),
          waterContaminated: (sec.waterSource?.contaminationRisk ?? 0) > 0.3,
          animalsCount: sec.animals.reduce((x, y) => x + y.count, 0),
          predatorsCount: sec.animals
            .filter((a) => a.temperament === 'predator')
            .reduce((x, y) => x + y.count, 0),
          hazardLevel: Number(sec.hazardLevel.toFixed(2)),
          agentsCount: sectorOccupancy[sec.key] ?? 0,
          sheltersBuilt: sec.sheltersBuilt,
          foodCaches: sec.foodCaches,
        })),
      },

      societyAndLanguage: {
        totalRelationships: totalRels,
        positiveRelationships: posRels,
        negativeRelationships: negRels,
        formedGroups,
        cooperationRate:
          totalCoops + totalConflicts > 0
            ? Number((totalCoops / (totalCoops + totalConflicts)).toFixed(3))
            : 0,
        conflictRate:
          totalCoops + totalConflicts > 0
            ? Number((totalConflicts / (totalCoops + totalConflicts)).toFixed(3))
            : 0,
        knowledgeExchanges: this.collectiveMemory.totalKnowledgeExchanges,
        observationalLearnings: this.observationalLearnings,
        signalsCount: this.collectiveMemory.symbolsMap.size,
        vocabularyCount: alive.reduce((s, a) => s + Object.keys(a.vocabulary).length, 0),
        collectiveCommunicationLevel: Number(
          Math.min(1, this.collectiveMemory.symbolsMap.size / 4).toFixed(2),
        ),
        symbols: this.collectiveMemory.getSymbolsArray(),
      },

      survivalAndExtinction: {
        riskLevel: this.computeExtinctionRisk(),
        survivalRate: Number((alive.length / nAll).toFixed(3)),
        unmetNeedsRatio: Number((unmetCount / nAlive).toFixed(3)),
        causesOfDeath,
        crisisDiagnosticsAr: this.crisisDiagnosticsAr,
        extinctionCount: this.extinctionRecords.length,
        recoveryCount: this.recoveryEvents.length,
        consecutiveFailedRecoveries: this.consecutiveFailedRecoveries,
        extinctionRecords: this.extinctionRecords,
        recoveryEvents: this.recoveryEvents,
      },

      persistenceStatus: {
        sqliteReady: this.sqliteReady,
        lastCheckpointAt: latestCp?.savedAt,
        lastCheckpointId: latestCp?.checkpointId,
        totalCheckpoints: this.checkpoints.length,
        checkpoints: this.checkpoints.slice(0, 12),
      },

      knowledgeItems: this.collectiveMemory.getKnowledgeArray(),
      recentExperiences: this.collectiveMemory.experiences.slice(-60).reverse(),
      generations: Array.from(this.generationsMap.values()).sort(
        (a, b) => b.generation - a.generation,
      ),
      timeline: [...this.timeline].sort((a, b) => a.tick - b.tick),
      recentEvents: this.events.slice(0, 150),
      agents: agentsSummary,
      history: this.history,
      training: this.trainingState,
      packages: this.brainPackages,
      benchmarks: this.getBenchmarks(),
    };
  }

  public exportSeparatedDomains(): SerializedEngineDomains {
    const agentsState: SerializedEngineDomains['agentsState'] = [];
    const neuralWeights: SerializedEngineDomains['neuralWeights'] = {};
    const personalMemories: SerializedEngineDomains['personalMemories'] = {};

    for (const a of this.agents) {
      const { brain, episodicMemory, longTermMemory, ...rest } = a;
      agentsState.push(rest);
      neuralWeights[a.identity.id] = brain;
      personalMemories[a.identity.id] = { episodicMemory, longTermMemory };
    }

    return {
      worldState: this.world,
      agentsState,
      neuralWeights,
      personalMemories,
      collectiveExperiences: this.collectiveMemory.experiences,
      civilizationKnowledge: this.collectiveMemory.getKnowledgeArray(),
      symbols: this.collectiveMemory.getSymbolsArray(),
      generations: Array.from(this.generationsMap.values()),
      eventLogs: this.events,
      timeline: this.timeline,
      extinctionRecords: this.extinctionRecords,
      recoveryEvents: this.recoveryEvents,
      preservedRevivalPool: this.preservedRevivalPool,
      history: this.history,
      meta: {
        runId: this.world.runId,
        currentGeneration: this.currentGeneration,
        recoveryPolicy: this.recoveryPolicy,
        serialCounter: this.serialCounter,
        birthsCount: this.birthsCount,
        deathsCount: this.deathsCount,
        restoredBrainsCount: this.restoredBrainsCount,
        observationalLearnings: this.observationalLearnings,
        consecutiveFailedRecoveries: this.consecutiveFailedRecoveries,
        lastRecoveryAttemptTick: this.lastRecoveryAttemptTick,
        milestoneFlags: this.milestoneFlags,
        totalExperiencesRecorded: this.collectiveMemory.totalExperiencesRecorded,
        totalExperiencesReplayed: this.collectiveMemory.totalExperiencesReplayed,
        totalKnowledgeExchanges: this.collectiveMemory.totalKnowledgeExchanges,
        speedMultiplier: this.speedMultiplier,
        elapsedRealSeconds: this.elapsedRealSeconds,
      },
    };
  }

  public loadFromSeparatedDomains(domains: SerializedEngineDomains): void {
    this.world = domains.worldState;
    this.agents = domains.agentsState.map((base) => {
      const brain = domains.neuralWeights[base.identity.id];
      const mem = domains.personalMemories[base.identity.id];
      return {
        ...base,
        brain,
        episodicMemory: mem?.episodicMemory ?? [],
        longTermMemory: mem?.longTermMemory ?? {
          knownSafeEntities: [],
          knownDangerousEntities: [],
          preferredSectors: [],
          consolidatedLessons: 0,
          recentActionCounts: {},
        },
      };
    });

    this.collectiveMemory = new CollectiveMemorySystem();
    this.collectiveMemory.experiences = domains.collectiveExperiences ?? [];
    for (const k of domains.civilizationKnowledge ?? []) {
      this.collectiveMemory.knowledgeMap.set(k.entityKey, k);
    }
    for (const s of domains.symbols ?? []) {
      this.collectiveMemory.symbolsMap.set(s.meaningKey, s);
    }

    this.generationsMap.clear();
    for (const g of domains.generations ?? []) {
      this.generationsMap.set(g.generation, g);
    }
    this.events = domains.eventLogs ?? [];
    this.timeline = domains.timeline ?? [];
    this.extinctionRecords = domains.extinctionRecords ?? [];
    this.recoveryEvents = domains.recoveryEvents ?? [];
    this.preservedRevivalPool = domains.preservedRevivalPool ?? [];
    this.history = domains.history ?? [];

    const m = domains.meta;
    this.currentGeneration = m.currentGeneration;
    this.recoveryPolicy = m.recoveryPolicy;
    this.serialCounter = m.serialCounter;
    this.birthsCount = m.birthsCount;
    this.deathsCount = m.deathsCount;
    this.restoredBrainsCount = m.restoredBrainsCount;
    this.observationalLearnings = m.observationalLearnings;
    this.consecutiveFailedRecoveries = m.consecutiveFailedRecoveries;
    this.lastRecoveryAttemptTick = m.lastRecoveryAttemptTick;
    this.milestoneFlags = m.milestoneFlags ?? {};
    this.collectiveMemory.totalExperiencesRecorded = m.totalExperiencesRecorded ?? 0;
    this.collectiveMemory.totalExperiencesReplayed = m.totalExperiencesReplayed ?? 0;
    this.collectiveMemory.totalKnowledgeExchanges = m.totalKnowledgeExchanges ?? 0;
    this.speedMultiplier = m.speedMultiplier ?? 1;
    this.elapsedRealSeconds = m.elapsedRealSeconds ?? 0;
  }

  public getAgentDetail(agentId: string): AgentState | undefined {
    return this.agents.find((a) => a.identity.id === agentId);
  }

  public getGenerationDetail(generation: number): {
    summary: GenerationSummary | undefined;
    agents: AgentSummaryView[];
    discoveries: ReturnType<CollectiveMemorySystem['getKnowledgeArray']>;
  } {
    const summary = this.generationsMap.get(generation);
    const snap = this.buildTelemetrySnapshot();
    return {
      summary,
      agents: snap.agents.filter((a) => a.generation === generation),
      discoveries: snap.knowledgeItems.filter((k) => k.discovererGeneration === generation),
    };
  }
}

export function computePayloadSha256(data: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}
