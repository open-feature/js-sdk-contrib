import { constantCase } from './constant-case';

describe('Constant Case', () => {
  it('should be STRING', () => {
    expect(constantCase('string')).toBe('STRING');
  });
  it('should be DOT_CASE', () => {
    expect(constantCase('dot.case')).toBe('DOT_CASE');
  });
  it('should be PASCAL_CASE', () => {
    expect(constantCase('PascalCase')).toBe('PASCAL_CASE');
  });
  it('should be VERSION_1_2_10', () => {
    expect(constantCase('version 1.2.10')).toBe('VERSION_1_2_10');
  });
});
