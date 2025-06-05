import { isInputJsonValue } from './is-json';

describe('isInputJsonValue', () => {
  it('returns true for JSON serializable values', () => {
    expect(isInputJsonValue({ foo: 'bar', baz: [1, 2] })).toBe(true);
    expect(isInputJsonValue('string')).toBe(true);
    expect(isInputJsonValue(42)).toBe(true);
  });

  it('returns false for non JSON serializable values', () => {
    expect(isInputJsonValue(() => null)).toBe(false);
    expect(isInputJsonValue(BigInt(1))).toBe(false);
  });
});
