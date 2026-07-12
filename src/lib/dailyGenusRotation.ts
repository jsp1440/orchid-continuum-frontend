export function shouldPauseRotation(slotsLength: number, hovered: boolean, tabVisible: boolean, reducedMotion: boolean): boolean {
  return slotsLength <= 1 || hovered || !tabVisible || reducedMotion;
}

export function nextReplacementIndex(current: number[], nextIndex: number, slotsLength: number): number {
  if (!slotsLength) return 0;
  const start = ((nextIndex % slotsLength) + slotsLength) % slotsLength;
  if (slotsLength <= current.length) return start;

  const occupied = new Set(current);
  for (let offset = 0; offset < slotsLength; offset += 1) {
    const candidate = (start + offset) % slotsLength;
    if (!occupied.has(candidate)) return candidate;
  }

  return start;
}
