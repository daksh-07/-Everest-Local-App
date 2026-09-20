const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

export function normalizeAbn(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export function isValidAbn(value: string): boolean {
  const normalized = normalizeAbn(value);
  if (!/^\d{11}$/.test(normalized)) return false;

  const digits = normalized.split('').map(Number);
  digits[0] -= 1;

  const checksum = digits.reduce(
    (sum, digit, index) => sum + digit * ABN_WEIGHTS[index],
    0,
  );

  return checksum % 89 === 0;
}
