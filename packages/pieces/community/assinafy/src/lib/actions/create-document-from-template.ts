import {
  createAction,
  InputPropertyMap,
  Property,
} from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { assinafyAuth } from '../auth';
import {
  AssinafyAuthValue,
  AssinafyClient,
  assinafyApi,
} from '../common/client';
import { assinafyConstants } from '../common/constants';
import { ApiDocument, ApiTemplate, assinafyFormat } from '../common/format';
import { assinafyProps } from '../common/props';
import { assinafySigners } from '../common/signers';
import { assinafyValues } from '../common/values';
import { assinafyOutputSchemas } from '../output-schemas';

async function findTemplate({
  client,
  templateId,
}: {
  client: AssinafyClient;
  templateId: string;
}): Promise<ApiTemplate | undefined> {
  const templates = await client.listAll<ApiTemplate>({
    request: {
      method: HttpMethod.GET,
      path: await client.accountPath('/templates'),
    },
    maxItems: MAX_TEMPLATES,
    until: (template) => template.id === templateId,
  });
  return templates.find((template) => template.id === templateId);
}

function isEditorRole(role: TemplateRole): boolean {
  return role.assignment_type?.toLowerCase() === 'editor';
}

async function loadTemplate({
  auth,
  template,
}: {
  auth: AssinafyAuthValue | undefined;
  template: unknown;
}): Promise<ApiTemplate | undefined> {
  if (!auth || typeof template !== 'string' || template === '') {
    return undefined;
  }
  return findTemplate({
    client: assinafyApi.forAuth(auth),
    templateId: template,
  });
}

function roleInputs(role: TemplateRole): [string, InputPropertyMap[string]][] {
  const roleName = role.name ?? role.id;
  return [
    [
      `email_${role.id}`,
      Property.ShortText({
        displayName: `${roleName}: Email`,
        description: 'Existing signers are matched by this email',
        required: false,
        placeholder: 'maria@example.com',
      }),
    ],
    [
      `whatsapp_${role.id}`,
      Property.ShortText({
        displayName: `${roleName}: WhatsApp Number`,
        description: 'International format with country code',
        required: false,
        placeholder: '+5548999990000',
      }),
    ],
    [
      `name_${role.id}`,
      Property.ShortText({
        displayName: `${roleName}: Full Name`,
        description:
          'Needed for new signers and for signers given only by WhatsApp number',
        required: false,
        placeholder: 'Maria Silva',
      }),
    ],
    [
      `cpf_${role.id}`,
      Property.ShortText({
        displayName: `${roleName}: CPF or CNPJ`,
        description:
          'Needed for digital certificate signing. Saved only on new signers; use Update Signer for existing ones',
        required: false,
        placeholder: '390.533.447-05',
      }),
    ],
    [
      `verification_${role.id}`,
      Property.StaticDropdown({
        displayName: `${roleName}: Verification`,
        description:
          'Defaults to email, or to WhatsApp when only a WhatsApp number is given',
        required: false,
        options: {
          disabled: false,
          options: assinafyConstants.signerVerificationOptions,
        },
      }),
    ],
    [
      `step_${role.id}`,
      Property.ShortText({
        displayName: `${roleName}: Signing Order`,
        description: 'Optional whole number starting at 1',
        required: false,
        placeholder: '1',
      }),
    ],
  ];
}

export const createDocumentFromTemplate = createAction({
  auth: assinafyAuth,
  name: 'create_document_from_template',
  classification: 'WRITE',
  displayName: 'Create Document from Template',
  description: 'Creates a document from a template and sends it for signature.',
  audience: 'both',
  aiMetadata: {
    description:
      'Generate a new Assinafy document from a ready template and send it for signature in one step, filling each template role with a signer given by email or WhatsApp (created if missing) and optionally pre-filling editor fields. Use Upload Document plus Request Signatures for a PDF that is not a template. Each call creates and sends a new document, so do not retry blindly.',
    idempotent: false,
  },
  outputSchema: assinafyOutputSchemas.document,
  props: {
    template: assinafyProps.template(
      'The template to use. Only templates with status "ready" can generate documents.'
    ),
    signers: Property.DynamicProperties({
      auth: assinafyAuth,
      displayName: 'Signers',
      description:
        'Who fills each role of the template. Existing signers are matched by email; new ones need a full name.',
      required: true,
      refreshers: ['template'],
      props: async ({ auth, template }): Promise<InputPropertyMap> => {
        const found = await loadTemplate({ auth, template });
        const roles = (found?.roles ?? []).filter(
          (role) => !isEditorRole(role)
        );
        return Object.fromEntries(roles.flatMap(roleInputs));
      },
    }),
    editor_fields: Property.DynamicProperties({
      auth: assinafyAuth,
      displayName: 'Template Fields',
      description:
        'Values written into the document before it is sent. Only shown for templates with editor fields.',
      required: false,
      refreshers: ['template'],
      props: async ({ auth, template }): Promise<InputPropertyMap> => {
        const found = await loadTemplate({ auth, template });
        const editorRoleIds = new Set(
          (found?.roles ?? []).filter(isEditorRole).map((role) => role.id)
        );
        const fields = (found?.pages ?? [])
          .flatMap((page) => page.fields ?? [])
          .filter((field) => editorRoleIds.has(field.role_id));
        return Object.fromEntries(
          fields.map((field) => [
            `field_${field.field_id}`,
            Property.ShortText({
              displayName: field.label || 'Field',
              required: false,
            }),
          ])
        );
      },
    }),
    document_name: Property.ShortText({
      displayName: 'Document Name',
      description:
        'Name of the new document, e.g. "Contract - Maria Silva.pdf". Defaults to the template name.',
      required: false,
      placeholder: 'Contract - Maria Silva.pdf',
      advanced: true,
    }),
    message: Property.LongText({
      displayName: 'Message',
      description: 'Text added to the invitation sent to the signers.',
      required: false,
      advanced: true,
    }),
    expires_at: Property.DateTime({
      displayName: 'Deadline',
      description:
        'When the request expires, at least one hour from now, e.g. 2026-12-31T18:00:00-03:00. Leave empty for no deadline.',
      required: false,
      advanced: true,
    }),
    tags: Property.Array({
      displayName: 'Tags',
      description:
        'Tag names to add to the document, e.g. "Contracts". Missing tags are created.',
      required: false,
      advanced: true,
    }),
  },
  async run({ auth, propsValue }) {
    const client = assinafyApi.forAuth(auth);
    const template = await findTemplate({
      client,
      templateId: propsValue.template,
    });
    if (!template) {
      throw new Error('The selected template was not found in this workspace.');
    }
    const roles = (template.roles ?? []).filter((role) => !isEditorRole(role));
    if (roles.length === 0) {
      throw new Error(
        'This template has no signer roles. Add one in Assinafy before sending documents from it.'
      );
    }
    const roleValues = propsValue.signers ?? {};
    const read = (key: string) =>
      assinafyValues.readText({ record: roleValues, key });
    const requests = roles.map((role) => {
      const label = `Role "${role.name ?? role.id}"`;
      return {
        label,
        email: read(`email_${role.id}`),
        whatsapp: read(`whatsapp_${role.id}`),
        fullName: read(`name_${role.id}`),
        governmentId: read(`cpf_${role.id}`),
        verification: read(`verification_${role.id}`),
        step: assinafyValues.readStep({
          record: roleValues,
          key: `step_${role.id}`,
          label,
        }),
      };
    });
    assinafySigners.validateContacts(requests);
    assinafySigners.validateSigningOrder(requests);

    const fieldValues = propsValue.editor_fields ?? {};
    const editorFields = Object.keys(fieldValues)
      .filter((key) => key.startsWith('field_'))
      .map((key) => ({
        field_id: key.slice('field_'.length),
        value: assinafyValues.readText({ record: fieldValues, key }),
      }))
      .filter((field) => field.value !== undefined);
    const expiresAt = assinafyValues.toIsoDate({
      value: propsValue.expires_at,
      label: 'Deadline',
    });

    const resolved = await assinafySigners.resolveAll({ client, requests });
    const document = await client.request<ApiDocument>({
      method: HttpMethod.POST,
      path: await client.accountPath(
        `/templates/${encodeURIComponent(propsValue.template)}/documents`
      ),
      body: assinafyValues.compact({
        signers: resolved.map(({ request, signer }, index) => ({
          role_id: roles[index].id,
          id: signer.id,
          ...assinafySigners.assignmentFields(request),
        })),
        editor_fields: editorFields,
        name: propsValue.document_name?.trim(),
        message: propsValue.message?.trim(),
        expires_at: expiresAt,
        tags: assinafyValues.textList(propsValue.tags),
      }),
    });
    return assinafyFormat.document(document);
  },
});

const MAX_TEMPLATES = 500;

type TemplateRole = NonNullable<ApiTemplate['roles']>[number];
