import type {
  CertaintyStatus,
  CivilizationKnowledgeItem,
  CollectiveExperienceRecord,
  EmergentSymbol,
  KnowledgeCategory,
} from '../../shared/types.ts';

const MAX_EXPERIENCES_IN_MEMORY = 3000;

export class CollectiveMemorySystem {
  public experiences: CollectiveExperienceRecord[] = [];
  public knowledgeMap: Map<string, CivilizationKnowledgeItem> = new Map();
  public symbolsMap: Map<string, EmergentSymbol> = new Map();
  public totalExperiencesRecorded = 0;
  public totalExperiencesReplayed = 0;
  public totalKnowledgeExchanges = 0;

  public recordExperience(
    exp: Omit<
      CollectiveExperienceRecord,
      'repetitions' | 'successCount' | 'failureCount' | 'reliabilityScore'
    >,
  ): {
    record: CollectiveExperienceRecord;
    knowledge: CivilizationKnowledgeItem;
    isNewDiscovery: boolean;
  } {
    this.totalExperiencesRecorded += 1;

    // Update or create aggregated civilization knowledge item for this entityKey
    let knowledge = this.knowledgeMap.get(exp.entityKey);
    let isNewDiscovery = false;

    if (!knowledge) {
      isNewDiscovery = true;
      knowledge = {
        id: `know_${exp.entityKey}`,
        entityKey: exp.entityKey,
        titleAr: this.deriveTitleAr(exp.entityKey, exp.category),
        category: exp.category,
        summaryAr: exp.immediateOutcome,
        discoveredAtTick: exp.simTimeTick,
        discovererId: exp.agentId,
        discovererGeneration: exp.generation,
        totalTrials: 0,
        uniqueExperimenters: 0,
        experimenterIds: [],
        successCount: 0,
        failureCount: 0,
        confidence: 0.5,
        certaintyStatus: 'unconfirmed',
        lastTestedTick: exp.simTimeTick,
        stillActive: true,
        conditionsTested: [],
      };
      this.knowledgeMap.set(exp.entityKey, knowledge);
    }

    knowledge.totalTrials += 1;
    if (exp.success) {
      knowledge.successCount += 1;
    } else {
      knowledge.failureCount += 1;
    }
    if (!knowledge.experimenterIds.includes(exp.agentId)) {
      knowledge.experimenterIds.push(exp.agentId);
      if (knowledge.experimenterIds.length > 200) {
        knowledge.experimenterIds.shift();
      }
      knowledge.uniqueExperimenters += 1;
    }

    const condLabel = `${exp.environmentalConditions.biome}:${exp.environmentalConditions.season}`;
    if (!knowledge.conditionsTested.includes(condLabel)) {
      knowledge.conditionsTested.push(condLabel);
    }

    knowledge.lastTestedTick = exp.simTimeTick;
    knowledge.summaryAr = exp.immediateOutcome;

    // Statistical reliability & uncertainty: single trial != absolute truth!
    // Sample-size factor grows smoothly with trials & independent experimenters.
    const successRatio = knowledge.successCount / Math.max(1, knowledge.totalTrials);
    const sampleWeight = Math.min(1, knowledge.totalTrials / 8);
    const diversityWeight = Math.min(1, knowledge.uniqueExperimenters / 4);
    const evidenceStrength = 0.5 * sampleWeight + 0.5 * diversityWeight;

    // Posterior confidence centered at 0.5 when sample size is small
    knowledge.confidence = Number(
      (0.5 * (1 - evidenceStrength) + successRatio * evidenceStrength).toFixed(3),
    );
    knowledge.certaintyStatus = this.evaluateCertainty(knowledge);

    const fullRecord: CollectiveExperienceRecord = {
      ...exp,
      repetitions: knowledge.totalTrials,
      successCount: knowledge.successCount,
      failureCount: knowledge.failureCount,
      reliabilityScore: knowledge.confidence,
    };

    this.experiences.push(fullRecord);
    if (this.experiences.length > MAX_EXPERIENCES_IN_MEMORY) {
      // Compact low-surprise middle records while keeping diverse & high-impact experiences
      this.compactExperiences();
    }

    return { record: fullRecord, knowledge, isNewDiscovery };
  }

  public appendDelayedOutcome(
    agentId: string,
    entityKey: string,
    delayedNote: string,
    delayedRewardDelta: number,
    causedHarm: boolean,
  ): void {
    for (let i = this.experiences.length - 1; i >= 0; i--) {
      const rec = this.experiences[i];
      if (rec.agentId === agentId && rec.entityKey === entityKey) {
        rec.delayedOutcomes.push(delayedNote);
        rec.longTermReward += delayedRewardDelta;
        rec.reward += delayedRewardDelta;
        if (causedHarm) {
          rec.damages += Math.abs(delayedRewardDelta);
          rec.success = false;
        }
        break;
      }
    }

    const knowledge = this.knowledgeMap.get(entityKey);
    if (knowledge && causedHarm) {
      knowledge.successCount = Math.max(0, knowledge.successCount - 1);
      knowledge.failureCount += 1;
      const successRatio = knowledge.successCount / Math.max(1, knowledge.totalTrials);
      const sampleWeight = Math.min(1, knowledge.totalTrials / 8);
      const diversityWeight = Math.min(1, knowledge.uniqueExperimenters / 4);
      const evidenceStrength = 0.5 * sampleWeight + 0.5 * diversityWeight;
      knowledge.confidence = Number(
        (0.5 * (1 - evidenceStrength) + successRatio * evidenceStrength).toFixed(3),
      );
      knowledge.certaintyStatus = this.evaluateCertainty(knowledge);
      knowledge.summaryAr = delayedNote;
    }
  }

  public queryKnowledgeForAgent(entityKey: string): {
    known: boolean;
    trials: number;
    experimenters: number;
    successCount: number;
    failureCount: number;
    confidence: number;
    certaintyStatus: CertaintyStatus;
  } {
    const item = this.knowledgeMap.get(entityKey);
    if (!item) {
      return {
        known: false,
        trials: 0,
        experimenters: 0,
        successCount: 0,
        failureCount: 0,
        confidence: 0.5,
        certaintyStatus: 'unconfirmed',
      };
    }
    return {
      known: true,
      trials: item.totalTrials,
      experimenters: item.uniqueExperimenters,
      successCount: item.successCount,
      failureCount: item.failureCount,
      confidence: item.confidence,
      certaintyStatus: item.certaintyStatus,
    };
  }

  public samplePrioritizedReplayBatch(batchSize: number): CollectiveExperienceRecord[] {
    if (this.experiences.length === 0) return [];
    const startTime = performance.now();
    const sampled: CollectiveExperienceRecord[] = [];
    const len = this.experiences.length;

    // Prioritized sampling: bias toward high |reward| or high damages (high surprise/value)
    for (let i = 0; i < batchSize; i++) {
      const idxA = Math.floor(Math.random() * len);
      const idxB = Math.floor(Math.random() * len);
      const a = this.experiences[idxA];
      const b = this.experiences[idxB];
      const prioA = Math.abs(a.reward) + a.damages * 0.2 + (a.delayedOutcomes.length > 0 ? 1 : 0);
      const prioB = Math.abs(b.reward) + b.damages * 0.2 + (b.delayedOutcomes.length > 0 ? 1 : 0);
      sampled.push(prioA >= prioB ? a : b);
    }

    this.totalExperiencesReplayed += sampled.length;
    void startTime;
    return sampled;
  }

  public recordOrReinforceSymbol(
    meaningKey: string,
    meaningAr: string,
    symbolToken: string,
    originatorId: string,
    generation: number,
    tick: number,
    success: boolean,
    isAdoption: boolean,
  ): EmergentSymbol {
    let sym = this.symbolsMap.get(meaningKey);
    if (!sym) {
      sym = {
        id: `sym_${meaningKey}`,
        symbol: symbolToken,
        meaningKey,
        meaningAr,
        originatorId,
        generation,
        createdTick: tick,
        adoptersCount: 1,
        successfulUses: 0,
        failedUses: 0,
        confidence: 0.4,
      };
      this.symbolsMap.set(meaningKey, sym);
    }

    if (isAdoption) {
      sym.adoptersCount += 1;
    }
    if (success) {
      sym.successfulUses += 1;
    } else {
      sym.failedUses += 1;
    }
    const totalUses = sym.successfulUses + sym.failedUses;
    sym.confidence =
      totalUses === 0
        ? 0.4
        : Number(
            (
              0.3 * Math.min(1, sym.adoptersCount / 6) +
              0.7 * (sym.successfulUses / totalUses)
            ).toFixed(3),
          );
    return sym;
  }

  public updateActiveUsage(currentTick: number): void {
    for (const item of this.knowledgeMap.values()) {
      item.stillActive = currentTick - item.lastTestedTick <= 240;
    }
  }

  public getKnowledgeArray(): CivilizationKnowledgeItem[] {
    return Array.from(this.knowledgeMap.values()).sort(
      (a, b) => b.totalTrials - a.totalTrials,
    );
  }

  public getSymbolsArray(): EmergentSymbol[] {
    return Array.from(this.symbolsMap.values()).sort(
      (a, b) => b.adoptersCount - a.adoptersCount,
    );
  }

  private evaluateCertainty(item: CivilizationKnowledgeItem): CertaintyStatus {
    if (item.totalTrials >= 4 && item.uniqueExperimenters >= 2) {
      if (item.confidence >= 0.62) return 'confirmed';
      if (item.confidence <= 0.38) return 'disproven';
    }
    return 'unconfirmed';
  }

  private deriveTitleAr(entityKey: string, category: KnowledgeCategory): string {
    const clean = entityKey
      .replace(/^plant_/, 'نبات: ')
      .replace(/^water_/, 'مصدر مياه: ')
      .replace(/^animal_/, 'كائن بري: ')
      .replace(/^craft_/, 'ابتكار: ')
      .replace(/^method_/, 'أسلوب: ')
      .replace(/^signal_/, 'إشارة: ')
      .replace(/_/g, ' ');
    if (clean !== entityKey) return clean;
    return `${category}: ${entityKey}`;
  }

  private compactExperiences(): void {
    // Keep most recent 1500 + top 750 highest-magnitude experiences
    const recent = this.experiences.slice(-1500);
    const older = this.experiences.slice(0, -1500);
    older.sort(
      (a, b) =>
        Math.abs(b.reward) + b.damages - (Math.abs(a.reward) + a.damages),
    );
    this.experiences = [...older.slice(0, 750), ...recent];
  }
}
