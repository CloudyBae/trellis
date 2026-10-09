export function gardenOf(element: HTMLElement | null): HTMLElement | null {
  return element === null ? null : element.closest<HTMLElement>(".garden");
}
