import { assinafyValues } from '../src/lib/common/values';
import { assinafySigners } from '../src/lib/common/signers';
import { assinafyFormat } from '../src/lib/common/format';
import { createSigner } from '../src/lib/actions/create-signer';
import { updateSigner } from '../src/lib/actions/update-signer';
import { findDocuments } from '../src/lib/actions/find-documents';
import { findSigners } from '../src/lib/actions/find-signers';
import { deleteDocument } from '../src/lib/actions/delete-document';
import { downloadDocument } from '../src/lib/actions/download-document';
import { updateSigningDeadline } from '../src/lib/actions/update-signing-deadline';
import { createDocumentFromTemplate } from '../src/lib/actions/create-document-from-template';
import { newEvent } from '../src/lib/triggers/new-event';
import { apiTemplate, context, replyData, sendRequest } from './helpers';

test('rejects invalid mapped inputs before network mutations', async () => {
  for (const limit of [NaN, Infinity, -Infinity, 1.5, 0, 101]) {
    await expect(findDocuments.run(context({ props: { limit } }))).rejects.toThrow('between 1 and 100');
    await expect(findSigners.run(context({ props: { search: 'example', limit } }))).rejects.toThrow('between 1 and 100');
  }
  await expect(findDocuments.run(context({ props: { status: 'toString' } }))).rejects.toThrow('valid document status');
  await expect(deleteDocument.run(context({ props: { document: ' ' } }))).rejects.toThrow('Document ID is required');
  await expect(createSigner.run(context({ props: { full_name: ' ' } }))).rejects.toThrow('Full Name is required');
  await expect(createSigner.run(context({ props: { full_name: 'Example', email: 'bad-address' } }))).rejects.toThrow('valid email');
  await expect(updateSigner.run(context({ props: { signer: 'sig_1', whatsapp: '123' } }))).rejects.toThrow('valid WhatsApp');
  await expect(updateSigningDeadline.run(context({ props: { document: 'doc_1', expires_at: '' } }))).rejects.toThrow('New Deadline is required');
  for (const file_type of ['toString', '__proto__', 'constructor']) {
    await expect(downloadDocument.run(context({ props: { document: 'doc_1', file_type } }))).rejects.toThrow('Unknown file type');
  }
  for (const events of [[], ['constructor'], ['unknown_event']]) {
    await expect(newEvent.onEnable(context({ props: { events } }))).rejects.toThrow('valid webhook event');
  }
  await expect(newEvent.onEnable(context({ props: { events: ['document_ready'], notification_email: 'invalid' } }))).rejects.toThrow('valid email');
  expect(sendRequest).not.toHaveBeenCalled();
});

test('validates contacts, typed steps and deadlines through shared helpers', () => {
  for (const email of ['invalid', 'two@@example.com', 'maria@ example.com']) {
    expect(() => assinafySigners.validateContacts([{ label: 'Signer 1', email }])).toThrow('valid email');
  }
  for (const whatsapp of ['call me', '+00000000000', '123', '+5548999990000ext1']) {
    expect(() => assinafyValues.validateContact({ label: 'Signer', whatsapp })).toThrow('valid WhatsApp');
  }
  for (const verification of ['toString', '__proto__', 'constructor']) {
    expect(() => assinafySigners.assignmentFields({ label: 'Signer', verification })).toThrow('unknown verification');
  }
  for (const step of [true, [], Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => assinafyValues.readStep({ record: { step }, key: 'step', label: 'Signer' })).toThrow('whole number');
  }
  expect(assinafyValues.encodeId(' doc/1 ', 'Document')).toBe('doc%2F1');
  expect(() => assinafyValues.toIsoDate({ value: new Date(Date.now() + 59 * 60000).toISOString(), label: 'Deadline' })).toThrow('at least one hour');
  expect(assinafyValues.toIsoTimestamp(1e20)).toBeNull();
  expect(assinafyValues.toIsoTimestamp('not a date')).toBeNull();
  expect(assinafyFormat.statusLabel('toString')).toBe('toString');
  expect(assinafyFormat.document({ id: 'doc_1', artifacts: { constructor: 'x', original: 'url' } }).available_files).toBe('original');
});

test('rejects a template still processing before changing signers', async () => {
  replyData([{ ...apiTemplate, status: 'processing' }]);
  await expect(createDocumentFromTemplate.run(context({ props: { template: 'tpl_1', signers: {} } }))).rejects.toThrow('template is not ready');
  expect(sendRequest).toHaveBeenCalledTimes(1);
});
