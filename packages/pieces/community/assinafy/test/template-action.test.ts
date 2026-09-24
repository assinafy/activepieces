import { HttpMethod } from '@activepieces/pieces-common';
import { createDocumentFromTemplate } from '../src/lib/actions/create-document-from-template';
import { assinafyFormat } from '../src/lib/common/format';
import {
  PRODUCTION,
  apiDocument,
  apiKeyAuth,
  apiSigner,
  apiTemplate,
  context,
  replyData,
  sentRequests,
} from './helpers';

const { signers, editor_fields: editorFields } =
  createDocumentFromTemplate.props;
const ctx = {} as never;
const otherTemplates = (from: number) =>
  Array.from({ length: 50 }, (_, index) => ({ id: `other_${from + index}` }));
const twoRoleTemplate = {
  ...apiTemplate,
  roles: [
    { id: 'role_a', name: 'Buyer', assignment_type: 'Signer' },
    { id: 'role_b', name: 'Seller', assignment_type: 'Signer' },
  ],
};

describe('Create Document from Template form', () => {
  test('shows contact, CPF, verification and order inputs for each non-editor role', async () => {
    replyData([apiTemplate]);
    const props = await signers.props(
      { auth: apiKeyAuth as never, template: 'tpl_1' },
      ctx
    );
    expect(Object.keys(props)).toEqual([
      'email_role_client',
      'whatsapp_role_client',
      'name_role_client',
      'cpf_role_client',
      'verification_role_client',
      'step_role_client',
    ]);
    expect(props['email_role_client'].displayName).toBe('Client: Email');
    expect(props['step_role_client'].displayName).toBe('Client: Signing Order');
    expect(sentRequests()[0]).toMatchObject({
      url: `${PRODUCTION}/accounts/acc_1/templates`,
      queryParams: { page: '1', 'per-page': '50' },
    });
  });

  test('shows one input per editor field', async () => {
    replyData([apiTemplate]);
    const props = await editorFields.props(
      { auth: apiKeyAuth as never, template: 'tpl_1' },
      ctx
    );
    expect(Object.keys(props)).toEqual(['field_fld_company']);
    expect(props['field_fld_company'].displayName).toBe('Company name');
  });

  test('labels unnamed fields and roles sensibly', async () => {
    const unnamed = {
      ...apiTemplate,
      roles: [{ id: 'role_x' }, { id: 'role_e', assignment_type: 'editor' }],
      pages: [{ fields: [{ field_id: 'f1', role_id: 'role_e' }] }, {}],
    };
    replyData([unnamed]);
    const roleProps = await signers.props(
      { auth: apiKeyAuth as never, template: 'tpl_1' },
      ctx
    );
    expect(roleProps['email_role_x'].displayName).toBe('role_x: Email');
    replyData([unnamed]);
    const fieldProps = await editorFields.props(
      { auth: apiKeyAuth as never, template: 'tpl_1' },
      ctx
    );
    expect(fieldProps['field_f1'].displayName).toBe('Field');
  });

  test('pages through templates until it finds the chosen one', async () => {
    replyData(otherTemplates(0));
    replyData([apiTemplate]);
    const props = await signers.props(
      { auth: apiKeyAuth as never, template: 'tpl_1' },
      ctx
    );
    expect(Object.keys(props)).toHaveLength(6);
    expect(sentRequests()[1].queryParams).toEqual({
      page: '2',
      'per-page': '50',
    });
  });

  test('stops after 500 templates and shows nothing for an unknown template', async () => {
    for (let i = 0; i < 10; i++) {
      replyData(otherTemplates(i * 50));
    }
    await expect(
      signers.props({ auth: apiKeyAuth as never, template: 'missing' }, ctx)
    ).resolves.toEqual({});
    expect(sentRequests()).toHaveLength(10);
    replyData([]);
    await expect(
      editorFields.props(
        { auth: apiKeyAuth as never, template: 'missing' },
        ctx
      )
    ).resolves.toEqual({});
  });

  test('stays empty until a connection and template are chosen', async () => {
    await expect(
      signers.props({ auth: undefined, template: 'tpl_1' }, ctx)
    ).resolves.toEqual({});
    await expect(
      signers.props({ auth: apiKeyAuth as never, template: '' }, ctx)
    ).resolves.toEqual({});
    await expect(
      editorFields.props(
        { auth: apiKeyAuth as never, template: undefined },
        ctx
      )
    ).resolves.toEqual({});
    expect(sentRequests()).toHaveLength(0);
  });
});

describe('Create Document from Template', () => {
  test('resolves a signer per role and sends the template document request', async () => {
    replyData([apiTemplate]);
    replyData([]);
    replyData({ ...apiSigner, id: 'sig_client' });
    replyData({ ...apiSigner, id: 'sig_client' });
    replyData(apiDocument);
    const result = await createDocumentFromTemplate.run(
      context({
        props: {
          template: 'tpl_1',
          signers: {
            email_role_client: 'client@example.com',
            name_role_client: 'Client Person',
            whatsapp_role_client: '',
            cpf_role_client: '390.533.447-05',
            verification_role_client: 'certificate_email',
            step_role_client: '1',
          },
          editor_fields: {
            field_fld_company: ' Acme Ltda ',
            field_blank: '',
            ignored: 'x',
          },
          document_name: ' NDA - Acme.pdf ',
          message: 'Please sign',
          expires_at: '2026-12-31T18:00:00Z',
          tags: ['Contracts', ' ', 'NDA'],
        },
      })
    );
    expect(result).toEqual(assinafyFormat.document(apiDocument));
    expect(sentRequests()[2].body).toEqual({
      full_name: 'Client Person',
      email: 'client@example.com',
    });
    expect(sentRequests()[3]).toMatchObject({
      method: HttpMethod.PUT,
      body: { government_id: '390.533.447-05' },
    });
    expect(sentRequests()[4]).toMatchObject({
      method: HttpMethod.POST,
      url: `${PRODUCTION}/accounts/acc_1/templates/tpl_1/documents`,
      body: {
        signers: [
          {
            role_id: 'role_client',
            id: 'sig_client',
            verification_method: 'DigitalCertificate',
            notification_methods: ['Email'],
            step: 1,
          },
        ],
        editor_fields: [{ field_id: 'fld_company', value: 'Acme Ltda' }],
        name: 'NDA - Acme.pdf',
        message: 'Please sign',
        expires_at: '2026-12-31T18:00:00.000Z',
        tags: ['Contracts', 'NDA'],
      },
    });
  });

  test('defaults each role to email, or WhatsApp when only a number is given', async () => {
    replyData([twoRoleTemplate]);
    replyData([apiSigner]);
    replyData([
      {
        ...apiSigner,
        id: 'sig_w',
        email: null,
        whatsapp_phone_number: '+5548999990000',
      },
    ]);
    replyData(apiDocument);
    await createDocumentFromTemplate.run(
      context({
        props: {
          template: 'tpl_1',
          signers: {
            email_role_a: 'maria@example.com',
            name_role_b: 'João',
            whatsapp_role_b: '+5548999990000',
          },
          editor_fields: undefined,
        },
      })
    );
    expect(sentRequests()[3].body).toEqual({
      signers: [
        {
          role_id: 'role_a',
          id: 'sig_1',
          verification_method: 'Email',
          notification_methods: ['Email'],
        },
        {
          role_id: 'role_b',
          id: 'sig_w',
          verification_method: 'Whatsapp',
          notification_methods: ['Whatsapp'],
        },
      ],
    });
  });

  test('needs an existing template with signer roles and a contact for each role', async () => {
    replyData([]);
    await expect(
      createDocumentFromTemplate.run(
        context({ props: { template: 'tpl_1', signers: {} } })
      )
    ).rejects.toThrow('The selected template was not found in this workspace.');
    replyData([
      {
        ...apiTemplate,
        roles: [{ id: 'role_editor', assignment_type: 'Editor' }],
      },
    ]);
    await expect(
      createDocumentFromTemplate.run(
        context({ props: { template: 'tpl_1', signers: {} } })
      )
    ).rejects.toThrow('This template has no signer roles.');
    replyData([twoRoleTemplate]);
    await expect(
      createDocumentFromTemplate.run(
        context({
          props: {
            template: 'tpl_1',
            signers: { email_role_a: 'a@example.com' },
          },
        })
      )
    ).rejects.toThrow(
      'Role "Seller": provide an email address or a WhatsApp number.'
    );
    replyData([apiTemplate]);
    await expect(
      createDocumentFromTemplate.run(
        context({ props: { template: 'tpl_1', signers: undefined } })
      )
    ).rejects.toThrow('Role "Client": provide an email address');
  });

  test('validates every role before creating signers', async () => {
    replyData([apiTemplate]);
    replyData([apiTemplate]);
    replyData([apiTemplate]);
    await expect(
      createDocumentFromTemplate.run(
        context({
          props: {
            template: 'tpl_1',
            signers: { name_role_client: 'Someone' },
          },
        })
      )
    ).rejects.toThrow(
      'Role "Client": provide an email address or a WhatsApp number.'
    );
    await expect(
      createDocumentFromTemplate.run(
        context({
          props: {
            template: 'tpl_1',
            signers: {
              email_role_client: 'a@example.com',
              step_role_client: 'first',
            },
          },
        })
      )
    ).rejects.toThrow('Role "Client": signing order must be a whole number');
    await expect(
      createDocumentFromTemplate.run(
        context({
          props: {
            template: 'tpl_1',
            signers: { email_role_client: 'a@example.com' },
            expires_at: 'someday',
          },
        })
      )
    ).rejects.toThrow('Deadline must be a valid date and time');
    expect(sentRequests().map((sent) => sent.method)).toEqual([
      HttpMethod.GET,
      HttpMethod.GET,
      HttpMethod.GET,
    ]);
  });
});
