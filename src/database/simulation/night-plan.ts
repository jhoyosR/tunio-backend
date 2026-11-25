// Plan de las noches simuladas (BE-24): que telefonos llegan, cuando y que
// piden. Es puro y determinista: la misma semilla da siempre el mismo plan,
// para que una corrida se pueda repetir y conciliar (DAT-07).

export const NIGHT_START_TIME = '21:00';
export const NIGHT_LENGTH_SECONDS = 5 * 3600;

// Llegadas entre las 21:10 y las 00:10, y nada en los ultimos 10 minutos.
const FIRST_ARRIVAL_SECONDS = 10 * 60;
const ARRIVAL_WINDOW_SECONDS = 3 * 3600;
const LAST_CALL_SECONDS = NIGHT_LENGTH_SECONDS - 10 * 60;
const MAX_STAY_SECONDS = 2 * 3600;

// Por noche: entre 18 y 32 telefonos, de 1 a 4 acciones cada uno (por debajo
// del limite de 5 solicitudes por hora). Mas o menos la mitad son
// habituales, que vuelven noche tras noche.
const MIN_DEVICES = 18;
const DEVICE_SPREAD = 15;
const MAX_ACTIONS_PER_DEVICE = 4;
const REGULARS = 15;
const REGULAR_ATTENDANCE = 0.6;
const DEVICE_POOL = 80;

// La penultima noche es floja a proposito (de 5 a 7 telefonos), para que la
// baja participacion (docs/08, G3) tenga algo que mostrar. Necesita 3 noches
// anteriores: solo ocurre con 5 noches o mas.
const LOW_NIGHT_MIN_DEVICES = 5;
const LOW_NIGHT_SPREAD = 3;
const LOW_NIGHT_MIN_HISTORY = 3;

// Popularidad tipo Zipf: unas pocas canciones acaparan, como en un bar.
const ZIPF_EXPONENT = 1.1;

const REMOVALS_MIN = 1;
const REMOVALS_SPREAD = 2;
const REMOVALS_FROM_SECONDS = 3600;

export interface PlannedAction {
  // Segundos desde las 21:00 de esa noche.
  atSeconds: number;
  // Pedir o votar: device es un indice de devicePool y song del catalogo.
  kind: 'REQUEST' | 'REMOVE';
  device: number;
  song: number;
}

export interface NightPlan {
  // 1 = ayer.
  daysAgo: number;
  devices: number;
  actions: PlannedAction[];
}

export interface SimulationPlan {
  // UUID de instalacion de cada telefono, como los generaria la app.
  devicePool: string[];
  nights: NightPlan[];
}

export type Random = () => number;

// mulberry32: suficiente para simular, y reproducible sin dependencias.
export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function planSimulation(
  nights: number,
  catalogSize: number,
  seed: number,
): SimulationPlan {
  const random = createRandom(seed);
  const devicePool = Array.from({ length: DEVICE_POOL }, () =>
    randomUuid(random),
  );
  const pickSong = zipfPicker(catalogSize, random);
  const plans: NightPlan[] = [];
  for (let index = 0; index < nights; index += 1) {
    const isLowNight = index === nights - 2 && index >= LOW_NIGHT_MIN_HISTORY;
    const devices = isLowNight
      ? LOW_NIGHT_MIN_DEVICES + Math.floor(random() * LOW_NIGHT_SPREAD)
      : MIN_DEVICES + Math.floor(random() * DEVICE_SPREAD);
    plans.push({
      daysAgo: nights - index,
      devices,
      actions: planNight(devices, random, pickSong),
    });
  }
  return { devicePool, nights: plans };
}

function planNight(
  devices: number,
  random: Random,
  pickSong: () => number,
): PlannedAction[] {
  const actions: PlannedAction[] = [];
  for (const device of pickDevices(devices, random)) {
    const arrival =
      FIRST_ARRIVAL_SECONDS + Math.floor(random() * ARRIVAL_WINDOW_SECONDS);
    const stay = Math.min(MAX_STAY_SECONDS, LAST_CALL_SECONDS - arrival);
    const count = 1 + Math.floor(random() * MAX_ACTIONS_PER_DEVICE);
    for (let i = 0; i < count; i += 1) {
      actions.push({
        atSeconds: arrival + Math.floor(random() * stay),
        kind: 'REQUEST',
        device,
        song: pickSong(),
      });
    }
  }
  const removals = REMOVALS_MIN + Math.floor(random() * REMOVALS_SPREAD);
  for (let i = 0; i < removals; i += 1) {
    actions.push({
      atSeconds:
        REMOVALS_FROM_SECONDS +
        Math.floor(random() * (LAST_CALL_SECONDS - REMOVALS_FROM_SECONDS)),
      kind: 'REMOVE',
      device: -1,
      song: -1,
    });
  }
  return actions.sort((a, b) => a.atSeconds - b.atSeconds);
}

// Los habituales primero, el resto al azar entre los demas del grupo.
function pickDevices(count: number, random: Random): number[] {
  const regulars = Array.from({ length: REGULARS }, (_, i) => i).filter(
    () => random() < REGULAR_ATTENDANCE,
  );
  const others = shuffle(
    Array.from({ length: DEVICE_POOL - REGULARS }, (_, i) => i + REGULARS),
    random,
  );
  return [...regulars, ...others].slice(0, count);
}

// El orden de popularidad es el mismo todas las noches: los exitos se
// repiten, como en un local de verdad.
function zipfPicker(size: number, random: Random): () => number {
  const ranking = shuffle(
    Array.from({ length: size }, (_, i) => i),
    random,
  );
  const weights = ranking.map(
    (_, rank) => 1 / Math.pow(rank + 1, ZIPF_EXPONENT),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return () => {
    let target = random() * total;
    for (let rank = 0; rank < size; rank += 1) {
      target -= weights[rank];
      if (target <= 0) {
        return ranking[rank];
      }
    }
    return ranking[size - 1];
  };
}

function shuffle<T>(items: T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// UUID v4 con bytes de la semilla: el mismo telefono en cada corrida.
function randomUuid(random: Random): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
