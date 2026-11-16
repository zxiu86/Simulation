import {
  AGENT_ACTIONS,
  ENGINE_VERSION,
  NN_ARCHITECTURE_VERSION,
  SCHEMA_VERSION,
  type AgentState,
  type BrainPackage,
  type PromotionVerificationResult,
  type TrainingSessionState,
} from '../../shared/types.ts';
import {
  computeBrainIntegrityHash,
  ensureBrainOptimizerBuffers,
  forwardBrain,
  HIDDEN_SIZE,
  INPUT_SIZE,
  OUTPUT_SIZE,
  validateBrainStructure,
} from './neuralBrain.ts';
import { CivilizationSimulationEngine } from './simulationEngine.ts';

export class IsolatedTrainingManager {
  public session: TrainingSessionState = {
    sessionId: 'idle',
    status: 'idle',
    episodesTarget: 15,
    episodesCompleted: 0,
    totalSteps: 0,
    focusMode: 'balanced',
    currentCohortSize: 16,
    avgReward: 0,
    avgSurvivalRate: 0,
    actionSuccessRate: 0,
    rewardHistory: [],
    evaluationPassed: false,
    updatedAt: new Date().toISOString(),
  };

  public packages: BrainPackage[] = [];
  private sandbox: CivilizationSimulationEngine | null = null;
  private timer: NodeJS.Timeout | null = null;
  private onUpdateCb?: (state: TrainingSessionState, packages: BrainPackage[]) => void;

  public setUpdateListener(cb: (state: TrainingSessionState, packages: BrainPackage[]) => void): void {
    this.onUpdateCb = cb;
  }

  public startSession(params: {
    episodesTarget?: number;
    focusMode?: TrainingSessionState['focusMode'];
    cohortSize?: number;
  }): TrainingSessionState {
    this.stopSession();
    const episodesTarget = Math.max(4, Math.min(60, params.episodesTarget ?? 15));
    const focusMode = params.focusMode ?? 'balanced';
    const cohortSize = Math.max(8, Math.min(30, params.cohortSize ?? 16));
    const sessionId = `trn_${Date.now()}`;

    this.sandbox = new CivilizationSimulationEngine({ runId: sessionId, simulationId: sessionId });
    this.sandbox.agents = this.sandbox.agents.slice(0, cohortSize);
    this.sandbox.simStatus = 'Running';

    this.session = {
      sessionId,
      status: 'running',
      episodesTarget,
      episodesCompleted: 0,
      totalSteps: 0,
      focusMode,
      currentCohortSize: cohortSize,
      avgReward: 0,
      avgSurvivalRate: 1,
      actionSuccessRate: 0,
      rewardHistory: [],
      evaluationPassed: false,
      updatedAt: new Date().toISOString(),
    };

    this.timer = setInterval(() => {
      this.runOneEpisodeStep();
    }, 60);

    this.notify();
    return this.session;
  }

  public runSynchronousEpisodes(
    episodesTarget = 10,
    focusMode: TrainingSessionState['focusMode'] = 'balanced',
    cohortSize = 14,
  ): { session: TrainingSessionState; exportedPackage: BrainPackage | null } {
    this.stopSession();
    const sessionId = `trn_cli_${Date.now()}`;
    this.sandbox = new CivilizationSimulationEngine({ runId: sessionId, simulationId: sessionId });
    this.sandbox.agents = this.sandbox.agents.slice(0, cohortSize);
    this.sandbox.simStatus = 'Running';

    this.session = {
      sessionId,
      status: 'running',
      episodesTarget,
      episodesCompleted: 0,
      totalSteps: 0,
      focusMode,
      currentCohortSize: cohortSize,
      avgReward: 0,
      avgSurvivalRate: 1,
      actionSuccessRate: 0,
      rewardHistory: [],
      evaluationPassed: false,
      updatedAt: new Date().toISOString(),
    };

    while (this.session.episodesCompleted < this.session.episodesTarget) {
      this.runOneEpisodeStep();
    }

    const pkg = this.exportBestBrainPackage();
    return { session: this.session, exportedPackage: pkg };
  }

  private runOneEpisodeStep(): void {
    if (!this.sandbox || this.session.status !== 'running') return;

    const ticksPerEpisode = 18;
    for (let t = 0; t < ticksPerEpisode; t++) {
      this.sandbox.step();
      this.session.totalSteps += 1;

      if (this.session.focusMode === 'hunting') {
        for (const a of this.sandbox.agents) {
          if (a.alive) a.skills.hunting = Math.min(1, a.skills.hunting + 0.004);
        }
      } else if (this.session.focusMode === 'cooperation') {
        for (const a of this.sandbox.agents) {
          if (a.alive) a.skills.cooperation = Math.min(1, a.skills.cooperation + 0.004);
        }
      }
    }

    this.session.episodesCompleted += 1;
    const alive = this.sandbox.agents.filter((a) => a.alive);
    const n = Math.max(1, this.sandbox.agents.length);
    const avgReward = Number(
      (this.sandbox.agents.reduce((s, a) => s + a.rlStats.totalReward, 0) / n).toFixed(2),
    );
    const avgSurvivalRate = Number((alive.length / n).toFixed(3));
    const totalSuccess = this.sandbox.agents.reduce((s, a) => s + a.rlStats.successfulActions, 0);
    const totalFail = this.sandbox.agents.reduce((s, a) => s + a.rlStats.failedActions, 0);
    const actionSuccessRate =
      totalSuccess + totalFail > 0
        ? Number((totalSuccess / (totalSuccess + totalFail)).toFixed(3))
        : 0;

    this.session.avgReward = avgReward;
    this.session.avgSurvivalRate = avgSurvivalRate;
    this.session.actionSuccessRate = actionSuccessRate;
    this.session.rewardHistory.push({
      episode: this.session.episodesCompleted,
      avgReward,
      survivalRate: avgSurvivalRate,
    });
    this.session.updatedAt = new Date().toISOString();

    if (this.session.episodesCompleted >= this.session.episodesTarget) {
      this.finishSession();
    } else {
      this.notify();
    }
  }

  private finishSession(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const passedQualityGate =
      this.session.avgSurvivalRate >= 0.45 &&
      this.session.actionSuccessRate >= 0.32 &&
      this.session.totalSteps >= 50;

    this.session.evaluationPassed = passedQualityGate;
    this.session.status = 'completed';
    this.session.updatedAt = new Date().toISOString();

    if (this.sandbox) {
      const pkg = this.exportBestBrainPackage();
      if (pkg) {
        this.session.lastPackageId = pkg.packageId;
      }
    }
    this.notify();
  }

  public stopSession(): TrainingSessionState {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.session.status === 'running') {
      this.session.status = 'stopped';
      this.session.updatedAt = new Date().toISOString();
      this.notify();
    }
    return this.session;
  }

  public exportBestBrainPackage(): BrainPackage | null {
    if (!this.sandbox || this.sandbox.agents.length === 0) return null;
    const sorted = [...this.sandbox.agents].sort((a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      return b.rlStats.totalReward - a.rlStats.totalReward;
    });
    const best: AgentState = sorted[0];
    const integrityHash = computeBrainIntegrityHash(best.brain);
    const totalAct = best.rlStats.successfulActions + best.rlStats.failedActions;
    const individualSuccessRate =
      totalAct > 0 ? Number((best.rlStats.successfulActions / totalAct).toFixed(3)) : 0;

    const evalPassed =
      this.session.evaluationPassed ||
      (best.alive && individualSuccessRate >= 0.35 && best.brain.trainingSteps >= 20);

    const pkg: BrainPackage = {
      packageId: `pkg_${Date.now()}_${best.identity.id.slice(-6)}`,
      createdAt: new Date().toISOString(),
      engineVersion: ENGINE_VERSION,
      schemaVersion: SCHEMA_VERSION,
      architectureVersion: NN_ARCHITECTURE_VERSION,
      compatibilityVersion: '1.x',
      trainingMetadata: {
        sessionId: this.session.sessionId,
        episodesCompleted: this.session.episodesCompleted,
        totalSteps: best.brain.trainingSteps,
        avgSurvivalTicks: best.ageTicks,
        avgReward: Number(best.rlStats.totalReward.toFixed(2)),
        actionSuccessRate: individualSuccessRate,
        evaluationPassed: evalPassed,
        evaluationNotesAr: evalPassed
          ? 'اجتاز النموذج اختبار البقاء وجودة السياسة في البيئة المعزولة.'
          : 'لم يبلغ النموذج عتبة البقاء أو نجاح الأفعال المطلوبة بعد.',
      },
      learnedSkills: { ...best.skills },
      policyParameters: {
        inputSize: best.brain.inputSize,
        hiddenSize: best.brain.hiddenSize,
        outputSize: best.brain.outputSize,
      },
      weights: structuredClone(best.brain),
      knowledgeRefs: [...best.knowledgeIds],
      memoryState: structuredClone(best.episodicMemory.slice(-20)),
      identityTemplate: {
        suggestedName: `مدرّب-${best.identity.name}`,
        personality: { ...best.personality },
        geneticTraits: { ...best.identity.geneticTraits },
      },
      integrityHash,
    };

    this.packages.unshift(pkg);
    if (this.packages.length > 25) {
      this.packages.length = 25;
    }
    this.notify();
    return pkg;
  }

  private notify(): void {
    if (this.onUpdateCb) {
      this.onUpdateCb(this.session, this.packages);
    }
  }
}

export function verifyAndPromoteBrainPackage(
  pkg: BrainPackage,
  mainEngine: CivilizationSimulationEngine,
): PromotionVerificationResult {
  const checks: PromotionVerificationResult['checks'] = [];

  const complete =
    Boolean(pkg) &&
    Boolean(pkg.packageId) &&
    Boolean(pkg.weights) &&
    Boolean(pkg.policyParameters) &&
    Boolean(pkg.learnedSkills) &&
    Boolean(pkg.trainingMetadata) &&
    Boolean(pkg.integrityHash);
  checks.push({
    nameAr: 'اكتمال ملفات وبنية الحزمة',
    passed: complete,
    detailAr: complete
      ? 'جميع الحقول الإلزامية (الأوزان، السياسة، المهارات، البيانات الوصفية) متوفرة.'
      : 'الحزمة ناقصة وتفتقد حقولاً أساسية.',
  });

  if (!complete) {
    return {
      passed: false,
      packageId: pkg?.packageId ?? 'unknown',
      checks,
      reasonAr: 'فشل الدمج بسبب نقص مكونات الحزمة.',
    };
  }

  const compatOk =
    pkg.engineVersion.split('.')[0] === ENGINE_VERSION.split('.')[0] &&
    pkg.architectureVersion === NN_ARCHITECTURE_VERSION &&
    pkg.policyParameters.inputSize === INPUT_SIZE &&
    pkg.policyParameters.hiddenSize === HIDDEN_SIZE &&
    pkg.policyParameters.outputSize === OUTPUT_SIZE;
  checks.push({
    nameAr: 'توافق إصدار المحرك والشبكة العصبية',
    passed: compatOk,
    detailAr: compatOk
      ? `متوافق (${pkg.engineVersion} / ${pkg.architectureVersion}).`
      : `تعارض إصدار (${pkg.engineVersion} / ${pkg.architectureVersion}).`,
  });

  const expectedHash = computeBrainIntegrityHash(pkg.weights);
  const hashOk = expectedHash === pkg.integrityHash;
  checks.push({
    nameAr: 'فحص التوقيع والسلامة (SHA-256)',
    passed: hashOk,
    detailAr: hashOk
      ? `التوقيع مطابق (${pkg.integrityHash.slice(0, 14)}…).`
      : 'عدم تطابق التوقيع؛ يُحتمل تلف أو تعديل الأوزان.',
  });

  const structCheck = validateBrainStructure(pkg.weights);
  checks.push({
    nameAr: 'سلامة مصفوفات الأوزان العصبية',
    passed: structCheck.valid,
    detailAr: structCheck.valid
      ? `مصفوفات سليمة (${pkg.weights.w1.length + pkg.weights.wPolicy.length} معامل).`
      : structCheck.reason ?? 'خلل في الأوزان.',
  });

  let policyRunnable = false;
  let policyDetail = '';
  if (structCheck.valid) {
    try {
      const probeInput = new Array<number>(INPUT_SIZE).fill(0.25);
      const mask = new Array<boolean>(OUTPUT_SIZE).fill(true);
      const cloneWeights = structuredClone(pkg.weights);
      ensureBrainOptimizerBuffers(cloneWeights);
      const probe = forwardBrain(cloneWeights, probeInput, 1.0, mask, () => 0.5);
      const probsSum = probe.probabilities.reduce((a, b) => a + b, 0);
      policyRunnable =
        AGENT_ACTIONS.includes(probe.chosenAction) &&
        Number.isFinite(probe.value) &&
        Math.abs(probsSum - 1) < 0.02;
      policyDetail = policyRunnable
        ? `السياسة قابلة للتشغيل (اختبار تنبؤ: ${probe.chosenAction}).`
        : 'مخرجات السياسة غير صالحة عددياً.';
    } catch (err) {
      policyRunnable = false;
      policyDetail = `خطأ أثناء فحص السياسة: ${(err as Error).message}`;
    }
  } else {
    policyDetail = 'تعذر اختبار السياسة لعدم سلامة الأوزان.';
  }
  checks.push({
    nameAr: 'اختبار قابلية تشغيل السياسة',
    passed: policyRunnable,
    detailAr: policyDetail,
  });

  const evalOk = pkg.trainingMetadata.evaluationPassed;
  checks.push({
    nameAr: 'تقييم جودة النموذج المدرّب',
    passed: evalOk,
    detailAr: pkg.trainingMetadata.evaluationNotesAr,
  });

  const allPassed = checks.every((c) => c.passed);
  if (!allPassed) {
    const failedNames = checks.filter((c) => !c.passed).map((c) => c.nameAr);
    return {
      passed: false,
      packageId: pkg.packageId,
      checks,
      reasonAr: `رُفض دمج الحزمة دون إيقاف المحاكاة الرئيسية؛ الفحوصات الفاشلة: ${failedNames.join('، ')}.`,
    };
  }

  const promotedAgent = mainEngine.promoteVerifiedPackage(pkg);
  return {
    passed: true,
    packageId: pkg.packageId,
    checks,
    promotedAgentId: promotedAgent.identity.id,
    reasonAr: `تم التحقق الكامل وإدخال الفرد ${promotedAgent.identity.name} إلى الحضارة بنجاح.`,
  };
}
