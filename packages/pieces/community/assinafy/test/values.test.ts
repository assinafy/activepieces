import { assinafyValues } from '../src/lib/common/values';

const {
  compact,
  digits,
  isGovernmentId,
  isRecord,
  readStep,
  readText,
  sameWhatsapp,
  textList,
  toIsoDate,
  toIsoTimestamp,
} = assinafyValues;

describe('values', () => {
  test('toIsoTimestamp reads ISO text and Unix seconds or milliseconds', () => {
    expect(toIsoTimestamp(1788273130)).toBe('2026-09-01T14:32:10.000Z');
    expect(toIsoTimestamp(1788273130000)).toBe('2026-09-01T14:32:10.000Z');
    expect(toIsoTimestamp('2026-09-01T14:32:10Z')).toBe('2026-09-01T14:32:10Z');
    expect(toIsoTimestamp('')).toBeNull();
    expect(toIsoTimestamp(null)).toBeNull();
    expect(toIsoTimestamp(Number.NaN)).toBeNull();
  });

  test('isRecord accepts plain objects only', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord('x')).toBe(false);
  });

  test('compact drops blank values but keeps false and zero', () => {
    expect(
      compact({
        a: undefined,
        b: null,
        c: '',
        d: [],
        e: false,
        f: 0,
        g: 'x',
        h: [1],
      })
    ).toEqual({
      e: false,
      f: 0,
      g: 'x',
      h: [1],
    });
  });

  test('readText trims strings, stringifies numbers and ignores everything else', () => {
    expect(readText({ record: { a: '  hi ' }, key: 'a' })).toBe('hi');
    expect(readText({ record: { a: '   ' }, key: 'a' })).toBeUndefined();
    expect(readText({ record: { a: 5548 }, key: 'a' })).toBe('5548');
    expect(readText({ record: { a: true }, key: 'a' })).toBeUndefined();
    expect(readText({ record: 'not a row', key: 'a' })).toBeUndefined();
  });

  test('readStep accepts positive whole numbers given as numbers or text', () => {
    const step = (value: unknown) =>
      readStep({ record: { step: value }, key: 'step', label: 'Signer 1' });
    expect(step(2)).toBe(2);
    expect(step('3')).toBe(3);
    expect(step('')).toBeUndefined();
    expect(step(null)).toBeUndefined();
    expect(
      readStep({ record: {}, key: 'step', label: 'Signer 1' })
    ).toBeUndefined();
    expect(() => step(0)).toThrow(
      'Signer 1: signing order must be a whole number starting at 1.'
    );
    expect(() => step(1.5)).toThrow('whole number');
    expect(() => step('first')).toThrow('whole number');
  });

  test('textList keeps non-blank strings and numbers', () => {
    expect(textList([' a ', '', 2026, 'b', null, { x: 1 }])).toEqual([
      'a',
      '2026',
      'b',
    ]);
    expect(textList(undefined)).toEqual([]);
  });

  test('toIsoDate normalises valid dates and rejects invalid ones', () => {
    expect(toIsoDate({ value: undefined, label: 'Deadline' })).toBeUndefined();
    expect(
      toIsoDate({ value: '2026-12-31T18:00:00-03:00', label: 'Deadline' })
    ).toBe('2026-12-31T21:00:00.000Z');
    expect(() => toIsoDate({ value: 'tomorrow', label: 'Deadline' })).toThrow(
      'Deadline must be a valid date and time'
    );
  });

  test('digits strips formatting', () => {
    expect(digits('+55 (48) 99999-0000')).toBe('5548999990000');
    expect(digits(null)).toBe('');
  });

  test('sameWhatsapp matches formatting differences and a missing country code', () => {
    expect(
      sameWhatsapp({ stored: '+5548999990000', given: '+55 (48) 99999-0000' })
    ).toBe(true);
    expect(
      sameWhatsapp({ stored: '+5548999990000', given: '(48) 99999-0000' })
    ).toBe(true);
    expect(sameWhatsapp({ stored: '+5548999990000', given: '99990000' })).toBe(
      false
    );
    expect(
      sameWhatsapp({ stored: '+5548111110000', given: '+5548999990000' })
    ).toBe(false);
    expect(sameWhatsapp({ stored: null, given: '+5548999990000' })).toBe(false);
    expect(sameWhatsapp({ stored: '+5548999990000', given: undefined })).toBe(
      false
    );
  });

  test('isGovernmentId accepts 11-digit CPFs and 14-digit CNPJs', () => {
    expect(isGovernmentId('390.533.447-05')).toBe(true);
    expect(isGovernmentId('11.222.333/0001-81')).toBe(true);
    expect(isGovernmentId('123')).toBe(false);
  });
});
