import { isInputJsonValue } from './is-json';

describe('isInputJsonValue', () => {
  describe('primitive values', () => {
    it('should return true for valid JSON primitives', () => {
      expect(isInputJsonValue(null)).toBe(true);
      expect(isInputJsonValue(true)).toBe(true);
      expect(isInputJsonValue(false)).toBe(true);
      expect(isInputJsonValue(42)).toBe(true);
      expect(isInputJsonValue(0)).toBe(true);
      expect(isInputJsonValue(-42)).toBe(true);
      expect(isInputJsonValue(3.14)).toBe(true);
      expect(isInputJsonValue('string')).toBe(true);
      expect(isInputJsonValue('')).toBe(true);
    });

    it('should return false for invalid JSON primitives', () => {
      expect(isInputJsonValue(undefined)).toBe(false);
      expect(isInputJsonValue(Symbol('test'))).toBe(false);
      expect(isInputJsonValue(BigInt(42))).toBe(false);
      expect(isInputJsonValue(NaN)).toBe(false);
      expect(isInputJsonValue(Infinity)).toBe(false);
      expect(isInputJsonValue(-Infinity)).toBe(false);
    });
  });

  describe('functions and objects', () => {
    it('should return false for functions', () => {
      expect(isInputJsonValue(() => {})).toBe(false);
      expect(isInputJsonValue(function () {})).toBe(false);
      expect(isInputJsonValue(async () => {})).toBe(false);
    });

    it('should return false for built-in objects', () => {
      expect(isInputJsonValue(new Date())).toBe(false);
      expect(isInputJsonValue(new RegExp('test'))).toBe(false);
      expect(isInputJsonValue(new Error('test'))).toBe(false);
      expect(isInputJsonValue(new Map())).toBe(false);
      expect(isInputJsonValue(new Set())).toBe(false);
    });
  });

  describe('arrays', () => {
    it('should return true for valid JSON arrays', () => {
      expect(isInputJsonValue([])).toBe(true);
      expect(isInputJsonValue([1, 2, 3])).toBe(true);
      expect(isInputJsonValue(['a', 'b', 'c'])).toBe(true);
      expect(isInputJsonValue([true, false, null])).toBe(true);
      expect(isInputJsonValue([1, 'string', true, null])).toBe(true);
    });

    it('should return false for arrays with invalid JSON values', () => {
      expect(isInputJsonValue([1, 2, undefined])).toBe(false);
      expect(isInputJsonValue([1, 2, Symbol('test')])).toBe(false);
      expect(isInputJsonValue([1, 2, () => {}])).toBe(false);
      expect(isInputJsonValue([1, 2, new Date()])).toBe(false);
    });

    it('should handle nested arrays', () => {
      expect(
        isInputJsonValue([
          [1, 2],
          [3, 4],
        ]),
      ).toBe(true);
      expect(isInputJsonValue([1, [2, [3, [4]]]])).toBe(true);
      expect(
        isInputJsonValue([
          [1, 2],
          [3, undefined],
        ]),
      ).toBe(false);
    });
  });

  describe('objects', () => {
    it('should return true for valid JSON objects', () => {
      expect(isInputJsonValue({})).toBe(true);
      expect(isInputJsonValue({ key: 'value' })).toBe(true);
      expect(isInputJsonValue({ a: 1, b: 2, c: 3 })).toBe(true);
      expect(isInputJsonValue({ foo: 'bar', baz: [1, 2] })).toBe(true);
    });

    it('should return false for objects with invalid JSON values', () => {
      expect(isInputJsonValue({ valid: 'value', invalid: undefined })).toBe(false);
      expect(isInputJsonValue({ valid: 'value', invalid: Symbol('test') })).toBe(false);
      expect(isInputJsonValue({ valid: 'value', invalid: () => {} })).toBe(false);
      expect(isInputJsonValue({ valid: 'value', invalid: new Date() })).toBe(false);
    });

    it('should handle nested objects', () => {
      const validNested = {
        level1: {
          level2: {
            level3: {
              value: 'deep',
            },
          },
        },
      };
      expect(isInputJsonValue(validNested)).toBe(true);

      const invalidNested = {
        level1: {
          level2: {
            level3: {
              invalid: new Date(),
            },
          },
        },
      };
      expect(isInputJsonValue(invalidNested)).toBe(false);
    });
  });

  describe('complex nested structures', () => {
    it('should handle deeply nested valid structures', () => {
      const deeplyNested = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: 'value' }],
              value: 'deep',
              moreNesting: {
                level4: {
                  level5: [{ a: 1 }, { b: [1, 2, 3] }, { c: { d: 'value' } }],
                },
              },
            },
          },
        },
      };
      expect(isInputJsonValue(deeplyNested)).toBe(true);
    });

    it('should detect invalid values in deeply nested structures', () => {
      const deeplyNestedInvalid = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, { nested: 'value' }],
              value: 'deep',
              moreNesting: {
                level4: {
                  level5: [
                    { a: 1 },
                    { b: [1, 2, 3] },
                    { c: { d: new Date() } }, // Invalid here
                  ],
                },
              },
            },
          },
        },
      };
      expect(isInputJsonValue(deeplyNestedInvalid)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle empty structures', () => {
      expect(isInputJsonValue({})).toBe(true);
      expect(isInputJsonValue([])).toBe(true);
      expect(isInputJsonValue('')).toBe(true);
    });

    it('should handle special number values', () => {
      expect(isInputJsonValue(0)).toBe(true);
      expect(isInputJsonValue(-0)).toBe(true);
      expect(isInputJsonValue(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isInputJsonValue(Number.MIN_SAFE_INTEGER)).toBe(true);
    });

    it('should handle objects with numeric keys', () => {
      const numericKeys = {
        0: 'zero',
        1: 'one',
        2: 'two',
      };
      expect(isInputJsonValue(numericKeys)).toBe(true);
    });
  });
});
