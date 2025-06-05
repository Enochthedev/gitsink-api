import { toSafeJson } from './validate-json';

describe('toSafeJson', () => {
  it('returns the same value for valid input', () => {
    const obj = { foo: 'bar', nested: { num: 1 } };
    expect(toSafeJson(obj)).toEqual(obj);
  });

  it('throws for invalid input', () => {
    const invalid: unknown = undefined;
    expect(() => toSafeJson(invalid)).toThrow();
  });
});
