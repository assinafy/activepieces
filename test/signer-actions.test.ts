import { HttpMethod } from '@activepieces/pieces-common';
import { createSigner } from '../src/lib/actions/create-signer';
import { findSigners } from '../src/lib/actions/find-signers';
import { updateSigner } from '../src/lib/actions/update-signer';
import { assinafyFormat } from '../src/lib/common/format';
import {
  PRODUCTION,
  apiSigner,
  context,
  replyData,
  sentRequests,
} from './helpers';

const signersUrl = `${PRODUCTION}/accounts/acc_1/signers`;

describe('Find Signers', () => {
  test('searches the workspace signers', async () => {
    replyData([apiSigner, { ...apiSigner, id: 'sig_2' }]);
    await expect(
      findSigners.run(context({ props: { search: ' maria ', limit: 1 } }))
    ).resolves.toEqual([assinafyFormat.signer(apiSigner)]);
    expect(sentRequests()[0]).toMatchObject({
      method: HttpMethod.GET,
      url: signersUrl,
      queryParams: { search: 'maria', page: '1', 'per-page': '50' },
    });
  });

  test('defaults to 25 results and validates the inputs', async () => {
    replyData([]);
    await findSigners.run(
      context({ props: { search: 'x', limit: undefined } })
    );
    expect(sentRequests()[0].queryParams).toEqual({
      search: 'x',
      page: '1',
      'per-page': '50',
    });
    await expect(
      findSigners.run(context({ props: { search: 'x', limit: 500 } }))
    ).rejects.toThrow('between 1 and 100');
    await expect(
      findSigners.run(context({ props: { search: '   ', limit: 5 } }))
    ).rejects.toThrow('Enter part of a name or email to search for.');
    expect(sentRequests()).toHaveLength(1);
  });
});

describe('Create Signer', () => {
  test('creates a signer with the given contact details', async () => {
    replyData(apiSigner);
    await expect(
      createSigner.run(
        context({
          props: {
            full_name: ' Maria Silva ',
            email: 'maria@example.com',
            whatsapp: ' ',
            government_id: undefined,
          },
        })
      )
    ).resolves.toEqual(assinafyFormat.signer(apiSigner));
    expect(sentRequests()).toHaveLength(1);
    expect(sentRequests()[0]).toMatchObject({
      method: HttpMethod.POST,
      url: signersUrl,
      body: { full_name: 'Maria Silva', email: 'maria@example.com' },
    });
  });

  test('sets the CPF/CNPJ with a follow-up update', async () => {
    replyData(apiSigner);
    replyData(apiSigner);
    const result = await createSigner.run(
      context({
        props: {
          full_name: 'Maria Silva',
          whatsapp: '+5548999990000',
          government_id: ' 39053344705 ',
        },
      })
    );
    expect(result).toEqual(assinafyFormat.signer(apiSigner));
    expect(sentRequests()[0].body).toEqual({
      full_name: 'Maria Silva',
      whatsapp_phone_number: '+5548999990000',
    });
    expect(sentRequests()[1]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${signersUrl}/sig_1`,
      body: { government_id: '39053344705' },
    });
  });

  test('checks the CPF/CNPJ before creating anything', async () => {
    await expect(
      createSigner.run(
        context({ props: { full_name: 'Maria Silva', government_id: '12345' } })
      )
    ).rejects.toThrow('A CPF has 11 digits and a CNPJ has 14 digits.');
    expect(sentRequests()).toHaveLength(0);
  });
});

describe('Update Signer', () => {
  test('sends only the filled-in fields', async () => {
    replyData({ ...apiSigner, full_name: 'Maria S. Silva' });
    const result = await updateSigner.run(
      context({
        props: {
          signer: 'sig_1',
          full_name: 'Maria S. Silva',
          email: '',
          whatsapp: undefined,
          government_id: '',
        },
      })
    );
    expect(result).toMatchObject({ full_name: 'Maria S. Silva' });
    expect(sentRequests()[0]).toMatchObject({
      method: HttpMethod.PUT,
      url: `${signersUrl}/sig_1`,
      body: { full_name: 'Maria S. Silva' },
    });
  });

  test('refuses an empty update and an invalid CPF/CNPJ', async () => {
    await expect(
      updateSigner.run(context({ props: { signer: 'sig_1' } }))
    ).rejects.toThrow('Fill in at least one field to update.');
    await expect(
      updateSigner.run(
        context({ props: { signer: 'sig_1', government_id: '1' } })
      )
    ).rejects.toThrow('A CPF has 11 digits');
    expect(sentRequests()).toHaveLength(0);
  });
});
