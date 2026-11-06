export function timestampedExportFilename(date: Date = new Date()): string {
  const twoDigits = (value: number) => String(value).padStart(2, '0');
  return `tagbox-${twoDigits(date.getFullYear() % 100)}${twoDigits(date.getMonth() + 1)}${twoDigits(date.getDate())}-${twoDigits(date.getHours())}${twoDigits(date.getMinutes())}.png`;
}
