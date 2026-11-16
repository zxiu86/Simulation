import {
  GRID_SIZE,
  WORLD_AREA_KM2,
  type AnimalEntity,
  type BiomeType,
  type PlantSpecies,
  type WaterSource,
  type WorldSector,
  type WorldState,
} from '../../shared/types.ts';

function createRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 48271) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function createInitialPlantCatalog(): Record<string, PlantSpecies> {
  return {
    plant_sweet_tuber: {
      id: 'plant_sweet_tuber',
      localName: 'درنات جذرية نشوية',
      nutrition: 32,
      toxicity: 0,
      medicinalValue: 0,
      delayedOnsetTicks: 0,
    },
    plant_wild_berry: {
      id: 'plant_wild_berry',
      localName: 'ثمار شجيرية داكنة',
      nutrition: 22,
      toxicity: 0,
      medicinalValue: 4,
      delayedOnsetTicks: 0,
    },
    plant_river_reed: {
      id: 'plant_river_reed',
      localName: 'براعم ضفاف لينة',
      nutrition: 18,
      toxicity: 2,
      medicinalValue: 2,
      delayedOnsetTicks: 2,
    },
    plant_bitter_leaf: {
      id: 'plant_bitter_leaf',
      localName: 'أوراق عطرية مرة',
      nutrition: 6,
      toxicity: 4,
      medicinalValue: 18,
      delayedOnsetTicks: 2,
    },
    plant_spiny_weed: {
      id: 'plant_spiny_weed',
      localName: 'أعشاب شوكية صفراء',
      nutrition: 8,
      toxicity: 26,
      medicinalValue: 0,
      delayedOnsetTicks: 3,
    },
    plant_night_bulb: {
      id: 'plant_night_bulb',
      localName: 'بصيلات برية لامعة',
      nutrition: 10,
      toxicity: 44,
      medicinalValue: 0,
      delayedOnsetTicks: 4,
    },
  };
}

function chooseBiome(x: number, y: number, rng: () => number): BiomeType {
  const riverDist = Math.abs(x - y);
  if (riverDist <= 1 && (x + y) % 2 === 0) return 'riverbank';
  if (riverDist === 0) return 'riverbank';
  if (x <= 2 && y >= 7) return 'marsh';
  if (x >= 7 && y <= 2) return 'rocky_highland';
  const r = rng();
  if (r < 0.34) return 'savanna';
  if (r < 0.66) return 'forest';
  if (r < 0.84) return 'rocky_highland';
  return 'arid_steppe';
}

function buildWaterSource(x: number, y: number, biome: BiomeType, rng: () => number): WaterSource | null {
  if (biome === 'riverbank') {
    return {
      id: `water_river_${x}_${y}`,
      kind: 'river',
      volume: 650 + Math.floor(rng() * 250),
      maxVolume: 900,
      regenerationRate: 14,
      contaminationRisk: 0.04,
    };
  }
  if (biome === 'marsh') {
    return {
      id: `water_stagnant_${x}_${y}`,
      kind: 'stagnant_pool',
      volume: 280 + Math.floor(rng() * 160),
      maxVolume: 480,
      regenerationRate: 5,
      contaminationRisk: 0.58,
    };
  }
  if (biome === 'forest' && rng() < 0.42) {
    return {
      id: `water_spring_${x}_${y}`,
      kind: 'spring',
      volume: 320 + Math.floor(rng() * 180),
      maxVolume: 520,
      regenerationRate: 8,
      contaminationRisk: 0.08,
    };
  }
  if (biome === 'savanna' && rng() < 0.25) {
    return {
      id: `water_pond_${x}_${y}`,
      kind: 'pond',
      volume: 180 + Math.floor(rng() * 120),
      maxVolume: 350,
      regenerationRate: 4,
      contaminationRisk: 0.28,
    };
  }
  return null;
}

function buildAnimals(x: number, y: number, biome: BiomeType, rng: () => number): AnimalEntity[] {
  const list: AnimalEntity[] = [];
  if (biome === 'savanna' || biome === 'riverbank') {
    list.push({
      id: `animal_herb_${x}_${y}`,
      speciesKey: 'طريدة عشبية سريعة',
      temperament: 'skittish',
      count: 4 + Math.floor(rng() * 6),
      maxCount: 12,
      meatYield: 42,
      dangerLevel: 0.12,
      difficulty: 0.48,
    });
  }
  if (biome === 'forest' || biome === 'marsh') {
    list.push({
      id: `animal_small_${x}_${y}`,
      speciesKey: 'حيوان بري صغير',
      temperament: 'docile',
      count: 5 + Math.floor(rng() * 6),
      maxCount: 14,
      meatYield: 24,
      dangerLevel: 0.05,
      difficulty: 0.28,
    });
  }
  if ((biome === 'forest' || biome === 'rocky_highland' || biome === 'savanna') && rng() < 0.45) {
    list.push({
      id: `animal_pred_${x}_${y}`,
      speciesKey: 'مفترس بري خطر',
      temperament: 'predator',
      count: 1 + Math.floor(rng() * 3),
      maxCount: 4,
      meatYield: 58,
      dangerLevel: 0.68,
      difficulty: 0.78,
    });
  }
  return list;
}

export function createInitialWorld(runId: string, seed = 20250101): WorldState {
  const rng = createRng(seed);
  const plantCatalog = createInitialPlantCatalog();
  const allPlantIds = Object.keys(plantCatalog);
  const sectors: WorldSector[] = [];

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const biome = chooseBiome(x, y, rng);
      const basePlant =
        biome === 'forest'
          ? 240
          : biome === 'riverbank'
            ? 210
            : biome === 'savanna'
              ? 175
              : biome === 'marsh'
                ? 140
                : biome === 'rocky_highland'
                  ? 85
                  : 65;

      const sectorPlants: string[] = [];
      for (const pid of allPlantIds) {
        if (biome === 'riverbank' && (pid === 'plant_river_reed' || pid === 'plant_wild_berry' || pid === 'plant_bitter_leaf')) {
          sectorPlants.push(pid);
        } else if (rng() < 0.6) {
          sectorPlants.push(pid);
        }
      }
      if (sectorPlants.length === 0) {
        sectorPlants.push('plant_sweet_tuber', 'plant_spiny_weed');
      }

      sectors.push({
        x,
        y,
        key: `${x},${y}`,
        biome,
        plantSupply: basePlant + Math.floor(rng() * 50),
        maxPlantSupply: basePlant + 90,
        plantSpeciesIds: sectorPlants,
        waterSource: buildWaterSource(x, y, biome, rng),
        animals: buildAnimals(x, y, biome, rng),
        stoneSupply: biome === 'rocky_highland' ? 140 : 35 + Math.floor(rng() * 35),
        woodSupply: biome === 'forest' ? 180 : biome === 'riverbank' ? 95 : 25 + Math.floor(rng() * 30),
        fiberSupply: biome === 'marsh' || biome === 'savanna' ? 130 : 45 + Math.floor(rng() * 40),
        hazardLevel:
          biome === 'marsh'
            ? 0.35
            : biome === 'rocky_highland'
              ? 0.28
              : biome === 'arid_steppe'
                ? 0.24
                : 0.1,
        sheltersBuilt: 0,
        foodCaches: 0,
        waterCaches: 0,
        plantedPlots: 0,
      });
    }
  }

  return {
    runId,
    tick: 0,
    worldDays: 0,
    areaKm2: WORLD_AREA_KM2,
    season: 'temperate',
    temperatureC: 24,
    rainfall: 0.55,
    climateStress: 0.15,
    sectors,
    plantCatalog,
  };
}

export function stepWorldEcology(
  world: WorldState,
  rngFn: () => number = Math.random,
): {
  totalConsumedEstimate: number;
  totalRegenerated: number;
} {
  world.tick += 1;
  world.worldDays = Number((world.tick / 12).toFixed(2));

  const seasonPhase = Math.floor((world.tick / 120) % 4);
  if (seasonPhase === 0) {
    world.season = 'temperate';
    world.temperatureC = 23 + Math.sin(world.tick * 0.05) * 3;
    world.rainfall = 0.55;
    world.climateStress = 0.12;
  } else if (seasonPhase === 1) {
    world.season = 'wet';
    world.temperatureC = 20 + Math.sin(world.tick * 0.05) * 2;
    world.rainfall = 0.85;
    world.climateStress = 0.22;
  } else if (seasonPhase === 2) {
    world.season = 'dry';
    world.temperatureC = 33 + Math.sin(world.tick * 0.05) * 4;
    world.rainfall = 0.22;
    world.climateStress = 0.42;
  } else {
    world.season = 'harsh';
    world.temperatureC = 11 + Math.sin(world.tick * 0.05) * 4;
    world.rainfall = 0.3;
    world.climateStress = 0.52;
  }

  let totalRegenerated = 0;
  const rainBoost = 0.5 + world.rainfall * 0.9;

  for (const sector of world.sectors) {
    const plotBonus = sector.plantedPlots * 2.5;
    const plantRegen = Math.min(
      sector.maxPlantSupply - sector.plantSupply,
      (1.8 + plotBonus) * rainBoost,
    );
    if (plantRegen > 0) {
      sector.plantSupply += plantRegen;
      totalRegenerated += plantRegen;
    }

    if (sector.waterSource) {
      const wRegen = Math.min(
        sector.waterSource.maxVolume - sector.waterSource.volume,
        sector.waterSource.regenerationRate * rainBoost,
      );
      if (wRegen > 0) {
        sector.waterSource.volume += wRegen;
        totalRegenerated += wRegen * 0.25;
      }
    }

    for (const animal of sector.animals) {
      if (animal.count < animal.maxCount && world.tick % 8 === 0) {
        if (animal.count >= 1 && rngFn() < 0.28) {
          animal.count = Math.min(animal.maxCount, animal.count + 1);
          totalRegenerated += 1;
        } else if (animal.count === 0 && world.tick % 40 === 0 && rngFn() < 0.2) {
          animal.count = 1;
        }
      }
    }

    if (world.tick % 10 === 0) {
      sector.woodSupply = Math.min(220, sector.woodSupply + 1.5);
      sector.fiberSupply = Math.min(180, sector.fiberSupply + 1.5);
    }
  }

  return {
    totalConsumedEstimate: 0,
    totalRegenerated,
  };
}
