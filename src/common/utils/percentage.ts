// Con un decimal: el tablero lo muestra como «73,4 %». null con denominador
// 0: «sin datos», nunca 0 % (docs/08 §2).
export function percentage(part: number, total: number): number | null {
  return total === 0 ? null : Math.round((part / total) * 1000) / 10;
}
