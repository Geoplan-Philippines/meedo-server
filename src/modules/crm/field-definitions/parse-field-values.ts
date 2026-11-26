import { FieldType } from '@prisma/client';

import { normalizeEmail } from '../crm.constants';
import {
  LONG_TEXT_MAX_LENGTH,
  TEXT_MAX_LENGTH,
  URL_MAX_LENGTH,
} from './system-fields';

export type FieldDefinitionView = {
  key: string;
  type: FieldType;
  options: string[];
  isRequired: boolean;
  isReadOnly: boolean;
};

export type FieldValueError = {
  key: string;
  message: string;
};

export type ParseFieldValuesResult =
  | { ok: true; normalized: Record<string, unknown> }
  | { ok: false; errors: FieldValueError[] };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const URL_PATTERN = /^https?:\/\//i;

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function asPlainObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function coerce(definition: FieldDefinitionView, raw: unknown): { value: unknown; error?: string } {
  if (isEmpty(raw)) {
    return { value: null };
  }

  switch (definition.type) {
    case 'text': {
      if (typeof raw !== 'string') return { value: raw, error: 'Must be text' };
      const value = definition.key === 'email' ? normalizeEmail(raw) : raw.trim();
      if (value.length > TEXT_MAX_LENGTH) return { value, error: `Must be at most ${TEXT_MAX_LENGTH} characters` };
      if (definition.key === 'email' && !EMAIL_PATTERN.test(value)) return { value, error: 'Must be a valid email' };
      return { value };
    }
    case 'long_text': {
      if (typeof raw !== 'string') return { value: raw, error: 'Must be text' };
      if (raw.length > LONG_TEXT_MAX_LENGTH) return { value: raw, error: `Must be at most ${LONG_TEXT_MAX_LENGTH} characters` };
      return { value: raw };
    }
    case 'number': {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return { value: raw, error: 'Must be a number' };
      return { value: raw };
    }
    case 'select': {
      if (typeof raw !== 'string') return { value: raw, error: 'Must be one of the allowed options' };
      if (!definition.options.includes(raw)) return { value: raw, error: 'Must be one of the allowed options' };
      return { value: raw };
    }
    case 'url': {
      if (typeof raw !== 'string') return { value: raw, error: 'Must be a URL' };
      const value = raw.trim();
      if (value.length > URL_MAX_LENGTH) return { value, error: `Must be at most ${URL_MAX_LENGTH} characters` };
      if (!URL_PATTERN.test(value)) return { value, error: 'Must be an http or https URL' };
      return { value };
    }
    case 'date': {
      if (typeof raw !== 'string') return { value: raw, error: 'Must be a date (YYYY-MM-DD)' };
      const match = DATE_PATTERN.exec(raw);
      if (!match) return { value: raw, error: 'Must be a date (YYYY-MM-DD)' };
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        return { value: raw, error: 'Must be a valid date' };
      }
      return { value: raw };
    }
    case 'datetime': {
      if (typeof raw !== 'string') return { value: raw, error: 'Must be a datetime' };
      if (Number.isNaN(Date.parse(raw))) return { value: raw, error: 'Must be a valid datetime' };
      return { value: raw };
    }
    default:
      return { value: raw, error: 'Unsupported field type' };
  }
}

export function parseFieldValues(
  definitions: FieldDefinitionView[],
  input: unknown,
  options: { mode: 'create' | 'update'; current?: Record<string, unknown> } = { mode: 'create' },
): ParseFieldValuesResult {
  const record = asPlainObject(input);
  if (!record) {
    return { ok: false, errors: [{ key: 'values', message: 'Must be an object' }] };
  }

  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]));
  const errors: FieldValueError[] = [];
  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(record)) {
    const definition = definitionsByKey.get(key);
    if (!definition) {
      errors.push({ key, message: 'Unknown field' });
      continue;
    }
    if (definition.isReadOnly) {
      errors.push({ key, message: 'Field is read-only' });
      continue;
    }
    const parsed = coerce(definition, record[key]);
    if (parsed.error) {
      errors.push({ key, message: parsed.error });
      continue;
    }
    normalized[key] = parsed.value;
  }

  const merged = { ...(options.current ?? {}), ...normalized };
  const requiredSource = options.mode === 'create' ? normalized : merged;
  for (const definition of definitions) {
    if (!definition.isRequired || definition.isReadOnly) continue;
    if (isEmpty(requiredSource[definition.key])) {
      errors.push({ key: definition.key, message: 'This field is required' });
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, normalized };
}

export function formatFieldValueErrors(errors: FieldValueError[]): string[] {
  return errors.map((error) => `${error.key}: ${error.message}`);
}
