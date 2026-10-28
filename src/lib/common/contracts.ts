import { z } from 'zod';
import { assinafyValues } from './values';

const date = z
  .string()
  .refine(
    assinafyValues.isCalendarDate,
    'Use a real calendar date as YYYY-MM-DD, from year 1000.'
  );
const timestamp = z.string().datetime({ offset: true });
const amount = z
  .number()
  .min(0)
  .max(9999999999999.99)
  .refine(
    (value) => /^\d+(?:\.\d{1,2})?$/.test(String(value)),
    'Use a value with at most two decimal places.'
  );
const plainText = (max: number) =>
  z
    .string()
    .max(max)
    .refine((value) => !/<[^>]*>/.test(value), 'Use plain text without HTML.');
const id = z.string().trim().min(1);
const statuses = ['draft', 'active', 'expired', 'terminated'] as const;
const terms = z
  .strictObject({
    status: z.enum(statuses).optional(),
    counterparty_name: plainText(255).nullable().optional(),
    counterparty_taxpayer_id: z
      .string()
      .max(20)
      .refine(assinafyValues.isGovernmentId, 'Enter a valid CPF or CNPJ.')
      .nullable()
      .optional(),
    value: amount.nullable().optional(),
    currency: z
      .string()
      .regex(/^[A-Za-z]{3}$/)
      .nullable()
      .optional(),
    start_date: date.nullable().optional(),
    end_date: date.nullable().optional(),
    auto_renew: z.boolean().nullable().optional(),
    renewal_term_months: z.number().int().min(1).max(600).nullable().optional(),
    notice_period_days: z.number().int().min(0).max(3650).nullable().optional(),
    owner_id: id.nullable().optional(),
    metadata: z
      .custom<Record<string, string>>((value) => {
        if (!assinafyValues.isRecord(value)) return false;
        const entries = Object.entries(value);
        return (
          entries.length <= 50 &&
          (!entries.length ||
            !entries.every(([key], index) => key === String(index))) &&
          entries.every(
            ([key, item]) =>
              /^[A-Za-z0-9_.-]{1,40}$/.test(key) &&
              plainText(500).safeParse(item).success
          )
        );
      }, 'Metadata must contain at most 50 named keys (1–40 letters, digits, _, - or .), each with plain text of at most 500 characters.')
      .nullable()
      .optional(),
    external_references: z
      .array(
        z.strictObject({
          system: z
            .string()
            .min(1)
            .max(64)
            .regex(/^[A-Za-z0-9_.-]+$/),
          id: z
            .string()
            .min(1)
            .max(255)
            .refine(
              (value) => value.trim().length > 0,
              'External ID cannot be empty.'
            )
            .refine(
              (value) => !/[\u{10000}-\u{10FFFF}]/u.test(value),
              'External IDs cannot contain four-byte characters.'
            ),
        })
      )
      .max(20)
      .nullable()
      .optional(),
    parent_document_id: id.nullable().optional(),
    relation_type: z.enum(['amendment', 'renewal', 'termination']).optional(),
    updated_at: timestamp.nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    'Send at least one contract term.'
  )
  .refine(
    (value) =>
      !value.start_date ||
      !value.end_date ||
      value.end_date >= value.start_date,
    'End date must be on or after start date.'
  );
const renewal = z
  .strictObject({
    end_date: z
      .union([date, z.literal('')])
      .nullable()
      .optional(),
    value: amount.nullable().optional(),
    term: z.number().int().min(1).optional(),
    updated_at: timestamp.optional(),
  })
  .refine(
    (value) => Boolean(value.end_date || value.term),
    'Map the current term or specify the new end_date so a retry cannot renew twice.'
  );
const termination = z.strictObject({
  reason: z.string().max(500).nullable().optional(),
  updated_at: timestamp.optional(),
});
const filters = z
  .strictObject({
    search: z.string().optional(),
    status: z.array(z.enum(statuses)).optional(),
    counterparty: z.string().optional(),
    end_date_from: date.optional(),
    end_date_to: date.optional(),
    ending_within_days: z.number().int().min(0).max(3650).optional(),
    external_system: z.string().optional(),
    external_id: z.string().optional(),
    sort: z
      .enum(['updated_at', '-updated_at', 'end_date', '-end_date'])
      .optional(),
    expand_document: z.boolean().optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (value) =>
      !value.end_date_from ||
      !value.end_date_to ||
      value.end_date_to >= value.end_date_from,
    'End date to must be on or after end date from.'
  );

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid contract input: ${result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ')}`
    );
  }
  return result.data;
}

export const assinafyContracts = {
  terms,
  renewal,
  termination,
  filters,
  parse,
};

// Contract and amendment payloads retain the API's fields, nulls and nested objects.
export type ApiContract = { document_id: string; [key: string]: unknown };
