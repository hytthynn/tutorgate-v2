export function selectLeft(left: number, triggerWidth: number, popupWidth: number, viewportWidth: number) {
  return Math.max(12,Math.min(left+triggerWidth/2-popupWidth/2,viewportWidth-popupWidth-12));
}
