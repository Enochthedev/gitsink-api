import { Prisma } from '@prisma/client';

export function isInputJsonValue(
  value: unknown,
): value is Prisma.InputJsonValue {
  // This works because JSON-serializable values are: primitives, arrays, objects
  try {
    const test = JSON.stringify(value);
    return typeof test === 'string';
  } catch {
    return false;
  }
}
