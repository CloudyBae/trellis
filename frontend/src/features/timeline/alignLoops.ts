export function alignLoops(): void {
  if (typeof document.getAnimations !== "function") {
    return;
  }
  for (const animation of document.getAnimations()) {
    const timing = animation.effect?.getComputedTiming();
    if (timing !== undefined && timing.iterations === Infinity && animation.startTime !== 0) {
      animation.startTime = 0;
    }
  }
}
