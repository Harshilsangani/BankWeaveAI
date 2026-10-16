type StatLike = number | null | undefined;

export function formatStat(value: StatLike): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "—";
}

export function formatAddedProfiles(
  stats: { manual?: StatLike; uploaded?: StatLike } | null | undefined
): string {
  if (!stats) return "—";
  return formatStat((stats.manual ?? 0) + (stats.uploaded ?? 0));
}
