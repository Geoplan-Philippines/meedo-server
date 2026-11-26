import { parseFieldValues, type FieldDefinitionView } from './parse-field-values';

const leadFields: FieldDefinitionView[] = [
  { key: 'firstName', type: 'text', options: [], isRequired: true, isReadOnly: false },
  { key: 'lastName', type: 'text', options: [], isRequired: true, isReadOnly: false },
  { key: 'email', type: 'text', options: [], isRequired: true, isReadOnly: false },
  { key: 'company', type: 'text', options: [], isRequired: false, isReadOnly: false },
  { key: 'message', type: 'long_text', options: [], isRequired: true, isReadOnly: false },
  { key: 'source', type: 'url', options: [], isRequired: false, isReadOnly: false },
  { key: 'priority', type: 'select', options: ['low', 'high'], isRequired: false, isReadOnly: false },
  { key: 'headcount', type: 'number', options: [], isRequired: false, isReadOnly: false },
  { key: 'startedOn', type: 'date', options: [], isRequired: false, isReadOnly: false },
  { key: 'status', type: 'select', options: ['NEW'], isRequired: false, isReadOnly: true },
  { key: 'receivedAt', type: 'datetime', options: [], isRequired: false, isReadOnly: true },
];

const validCreate = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'Ada@Example.com',
  message: 'Hello',
};

describe('parseFieldValues', () => {
  it('normalizes email and accepts a valid create payload', () => {
    const result = parseFieldValues(leadFields, validCreate, { mode: 'create' });
    expect(result).toEqual({
      ok: true,
      normalized: { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', message: 'Hello' },
    });
  });

  it('returns unknown, readonly, required, and length errors together', () => {
    const result = parseFieldValues(leadFields, {
      unknownKey: 'x',
      status: 'NEW',
      firstName: 'a'.repeat(501),
      source: 'ftp://example.com',
    }, { mode: 'create' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      { key: 'unknownKey', message: 'Unknown field' },
      { key: 'status', message: 'Field is read-only' },
      { key: 'firstName', message: 'Must be at most 500 characters' },
      { key: 'source', message: 'Must be an http or https URL' },
      { key: 'lastName', message: 'This field is required' },
      { key: 'email', message: 'This field is required' },
      { key: 'message', message: 'This field is required' },
    ]));
  });

  it('rejects long_text over 5000 and urls over 2048', () => {
    const result = parseFieldValues(leadFields, {
      ...validCreate,
      message: 'm'.repeat(5001),
      source: `https://example.com/${'a'.repeat(2048)}`,
    }, { mode: 'create' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      { key: 'message', message: 'Must be at most 5000 characters' },
      { key: 'source', message: 'Must be at most 2048 characters' },
    ]));
  });

  it('validates number, select, date, and datetime', () => {
    const result = parseFieldValues(leadFields, {
      ...validCreate,
      headcount: '3',
      priority: 'medium',
      startedOn: '2026-02-31',
    }, { mode: 'create' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual(expect.arrayContaining([
      { key: 'headcount', message: 'Must be a number' },
      { key: 'priority', message: 'Must be one of the allowed options' },
      { key: 'startedOn', message: 'Must be a valid date' },
    ]));
  });

  it('enforces required fields on update against the merged record', () => {
    const result = parseFieldValues(leadFields, { firstName: '' }, {
      mode: 'update',
      current: { ...validCreate, email: 'ada@example.com' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([{ key: 'firstName', message: 'This field is required' }]);
  });

  it('allows a partial update that keeps existing required fields', () => {
    const result = parseFieldValues(leadFields, { company: 'Analytical Engine' }, {
      mode: 'update',
      current: { ...validCreate, email: 'ada@example.com' },
    });
    expect(result).toEqual({ ok: true, normalized: { company: 'Analytical Engine' } });
  });
});
