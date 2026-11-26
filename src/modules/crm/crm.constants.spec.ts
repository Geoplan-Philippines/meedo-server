import { lowercaseEmail, normalizeEmail } from './crm.constants';

describe('email normalization', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Alex@Example.COM ')).toBe('alex@example.com');
  });

  it('leaves non-strings unchanged for the DTO transform', () => {
    expect(lowercaseEmail({ value: undefined })).toBeUndefined();
    expect(lowercaseEmail({ value: 1 })).toBe(1);
  });
});
