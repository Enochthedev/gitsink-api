import { z } from 'zod';
import { Prisma } from '@prisma/client';

const jsonValue: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(jsonValue),
    z.record(jsonValue),
    z.object({
      toJSON: z.function().returns(z.unknown()),
    }),
  ]),
);

export function toSafeJson(input: unknown): Prisma.InputJsonValue {
  const result = jsonValue.safeParse(input);
  if (!result.success) {
    throw new Error('Invalid JSON for Prisma.InputJsonValue');
  }
  return result.data;
}
