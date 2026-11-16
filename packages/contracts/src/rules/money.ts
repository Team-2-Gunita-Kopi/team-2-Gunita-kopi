/** Round to 2dp (cents), half away from zero. Internal helper. */
export function round2(x: number): number {
  const sign = x < 0 ? -1 : 1;
  return (sign * Math.round((Math.abs(x) + Number.EPSILON) * 100)) / 100;
}
