import { NIGHT_LENGTH_SECONDS, planSimulation } from './night-plan';

describe('planSimulation', () => {
  it('la misma semilla da el mismo plan, y otra semilla otro', () => {
    expect(planSimulation(6, 20, 42)).toEqual(planSimulation(6, 20, 42));
    expect(planSimulation(6, 20, 42)).not.toEqual(planSimulation(6, 20, 43));
  });

  it('una noche por dia, de la mas antigua a ayer', () => {
    const plan = planSimulation(4, 20, 1);
    expect(plan.nights.map((n) => n.daysAgo)).toEqual([4, 3, 2, 1]);
  });

  it('la penultima noche es floja si tiene 3 noches anteriores', () => {
    const plan = planSimulation(6, 20, 1);
    const devices = plan.nights.map((n) => n.devices);
    expect(devices[4]).toBeLessThan(8);
    expect(
      Math.min(...devices.filter((_, i) => i !== 4)),
    ).toBeGreaterThanOrEqual(18);
    // Con 4 noches no habria historial suficiente: ninguna floja.
    expect(
      Math.min(...planSimulation(4, 20, 1).nights.map((n) => n.devices)),
    ).toBeGreaterThanOrEqual(18);
  });

  it('acciones ordenadas, dentro de la noche y por debajo del limite por hora', () => {
    for (const night of planSimulation(8, 20, 3).nights) {
      const times = night.actions.map((a) => a.atSeconds);
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(Math.min(...times)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...times)).toBeLessThan(NIGHT_LENGTH_SECONDS);
      const perDevice = new Map<number, number>();
      for (const action of night.actions.filter((a) => a.kind === 'REQUEST')) {
        perDevice.set(action.device, (perDevice.get(action.device) ?? 0) + 1);
        expect(action.song).toBeGreaterThanOrEqual(0);
        expect(action.song).toBeLessThan(20);
      }
      expect(perDevice.size).toBe(night.devices);
      expect(Math.max(...perDevice.values())).toBeLessThanOrEqual(4);
    }
  });

  it('los UUID de instalacion son v4 validos y distintos', () => {
    const { devicePool } = planSimulation(1, 5, 9);
    expect(new Set(devicePool).size).toBe(devicePool.length);
    for (const id of devicePool) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });
});
