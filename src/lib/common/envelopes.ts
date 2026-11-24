import { z } from 'zod';
import { assinafyValues } from './values';

const id = z.string().trim().min(1);
const ids = z
  .array(id)
  .min(1)
  .refine(
    (values) => new Set(values).size === values.length,
    'List each ID only once.'
  );
const document = z.strictObject({
  id,
  method: z.enum(['virtual', 'collect']).optional(),
  signer_ids: ids,
  expires_at: z.string().nullable().optional(),
  copy_receiver_ids: z.array(id).optional(),
  entries: z
    .array(
      z.strictObject({
        page_id: id,
        fields: z.array(
          z.strictObject({
            signer_id: id,
            field_id: id,
            display_settings: z.strictObject({
              left: z.number().min(0),
              top: z.number().min(0),
              width: z.number().positive(),
              height: z.number().positive(),
              fontSize: z.number().positive(),
              fontFamily: z.string().optional(),
              backgroundColor: z.string().optional(),
            }),
          })
        ),
      })
    )
    .min(1)
    .optional(),
});
const schema = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine((value) => !value.includes('<'), 'Use a name without <.'),
  message: z.string().nullable().optional(),
  max_total_credits: z.number().min(0).optional(),
  signers: z
    .array(
      z.strictObject({
        id,
        verification_method: z
          .enum([
            'Email',
            'Whatsapp',
            'DigitalCertificate',
            'IdDocumentFaceMatchBasic',
          ])
          .optional(),
        notification_methods: z
          .array(z.enum(['Email', 'Whatsapp']))
          .length(1)
          .optional(),
        embedded: z.boolean().optional(),
      })
    )
    .min(1)
    .max(20),
  documents: z.array(document).min(1).max(20),
});

function parse(input: unknown) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `Invalid envelope input: ${result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`
    );
  }
  const body = result.data;
  const signers = new Map(body.signers.map((signer) => [signer.id, signer]));
  if (
    signers.size !== body.signers.length ||
    new Set(body.documents.map((doc) => doc.id)).size !== body.documents.length
  ) {
    throw new Error('List each envelope signer and document only once.');
  }
  for (const signer of body.signers) {
    const method = signer.verification_method ?? 'Email';
    const notification = signer.notification_methods?.[0];
    if (
      notification &&
      ['Email', 'Whatsapp'].includes(method) &&
      notification !== method
    ) {
      throw new Error(
        `Signer ${signer.id}: the notification must match ${method} verification.`
      );
    }
    if (signer.embedded && !['Email', 'Whatsapp'].includes(method)) {
      throw new Error(
        `Signer ${signer.id}: embedded signing requires Email or WhatsApp verification.`
      );
    }
    if (!body.documents.some((doc) => doc.signer_ids.includes(signer.id))) {
      throw new Error(
        `Signer ${signer.id} must sign at least one envelope document.`
      );
    }
  }
  for (const doc of body.documents) {
    for (const signerId of doc.signer_ids) {
      const signer = signers.get(signerId);
      if (!signer)
        throw new Error(
          `Document ${doc.id}: signer ${signerId} is not listed in the envelope.`
        );
      if (
        signer.verification_method === 'DigitalCertificate' &&
        (doc.signer_ids.length !== 1 || (doc.method ?? 'virtual') !== 'virtual')
      ) {
        throw new Error(
          `Document ${doc.id}: a digital certificate signer must sign alone with method virtual.`
        );
      }
    }
    if (doc.method === 'collect') {
      const fields = doc.entries?.flatMap((entry) => entry.fields) ?? [];
      if (
        !fields.length ||
        fields.some((field) => !doc.signer_ids.includes(field.signer_id)) ||
        doc.signer_ids.some(
          (signerId) => !fields.some((field) => field.signer_id === signerId)
        )
      ) {
        throw new Error(
          `Document ${doc.id}: collect fields must belong to exactly its signers, with at least one field per signer.`
        );
      }
    }
    if (doc.expires_at) {
      doc.expires_at = assinafyValues.toIsoDate({
        value: doc.expires_at,
        label: `Document ${doc.id} deadline`,
      });
    }
  }
  return body;
}

export const assinafyEnvelopes = { parse };
export type ApiEnvelope = { id: string; name: string; [key: string]: unknown };
