function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function compact(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
    )
  );
}

function readText({
  record,
  key,
}: {
  record: unknown;
  key: string;
}): string | undefined {
  const value = isRecord(record) ? record[key] : undefined;
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}

function readStep({
  record,
  key,
  label,
}: {
  record: unknown;
  key: string;
  label: string;
}): number | undefined {
  const value = isRecord(record) ? record[key] : undefined;
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const step = Number(value);
  if (!Number.isInteger(step) || step < 1) {
    throw new Error(
      `${label}: signing order must be a whole number starting at 1.`
    );
  }
  return step;
}

function textList(values: unknown[] | undefined): string[] {
  return (values ?? [])
    .map((value) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value).trim()
        : ''
    )
    .filter(Boolean);
}

function toIsoDate({
  value,
  label,
}: {
  value: string | undefined;
  label: string;
}): string | undefined {
  if (!value) {
    return undefined;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new Error(
      `${label} must be a valid date and time, e.g. 2026-12-31T18:00:00Z.`
    );
  }
  return new Date(time).toISOString();
}

function digits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function sameWhatsapp({
  stored,
  given,
}: {
  stored: string | null | undefined;
  given: string | undefined;
}): boolean {
  const storedDigits = digits(stored);
  const givenDigits = digits(given);
  if (storedDigits === '' || givenDigits === '') {
    return false;
  }
  return (
    storedDigits === givenDigits ||
    (givenDigits.length >= 10 && storedDigits.endsWith(givenDigits))
  );
}

function checkDigit({
  numbers,
  weights,
}: {
  numbers: number[];
  weights: number[];
}): number {
  const remainder =
    numbers.reduce((sum, value, index) => sum + value * weights[index], 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isGovernmentId(value: string): boolean {
  const numbers = [...digits(value)].map(Number);
  if (
    (numbers.length !== 11 && numbers.length !== 14) ||
    numbers.every((number) => number === numbers[0])
  ) {
    return false;
  }
  const weightsFor = (length: number) =>
    numbers.length === 11
      ? Array.from({ length }, (_, index) => length + 1 - index)
      : Array.from(
          { length },
          (_, index) =>
            [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - length)[index]
        );
  const body = numbers.length - 2;
  const first = checkDigit({
    numbers: numbers.slice(0, body),
    weights: weightsFor(body),
  });
  const second = checkDigit({
    numbers: numbers.slice(0, body + 1),
    weights: weightsFor(body + 1),
  });
  return numbers[body] === first && numbers[body + 1] === second;
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  return typeof value === 'string' && value !== '' ? value : null;
}

export const assinafyValues = {
  compact,
  digits,
  isGovernmentId,
  isRecord,
  readStep,
  readText,
  sameWhatsapp,
  textList,
  toIsoDate,
  toIsoTimestamp,
};
