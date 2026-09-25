import { tryCatch } from '@activepieces/pieces-framework';
import { HttpMethod } from '@activepieces/pieces-common';
import { AssinafyApiError, AssinafyClient } from './client';
import { assinafyConstants } from './constants';
import { ApiSigner } from './format';
import { assinafyValues } from './values';

function requestFromRow({
  row,
  label,
}: {
  row: unknown;
  label: string;
}): SignerRequest {
  if (!assinafyValues.isRecord(row)) {
    throw new Error(
      `${label} must be a set of fields such as Email or WhatsApp Number. Map each field instead of a whole list.`
    );
  }
  const read = (key: string) => assinafyValues.readText({ record: row, key });
  return {
    label,
    fullName: read('full_name'),
    email: read('email'),
    whatsapp: read('whatsapp'),
    governmentId: read('government_id'),
    verification: read('verification'),
    step: assinafyValues.readStep({ record: row, key: 'step', label }),
  };
}

function methodFor(request: SignerRequest) {
  const key =
    request.verification ??
    (request.email || !request.whatsapp ? 'email' : 'whatsapp');
  const method = assinafyConstants.signerVerificationMethods[key];
  if (!method) {
    throw new Error(`${request.label}: unknown verification method "${key}".`);
  }
  return method;
}

function validateContacts(requests: SignerRequest[]): void {
  for (const [index, request] of requests.entries()) {
    const { label, email, whatsapp, governmentId } = request;
    if (!email && !whatsapp) {
      throw new Error(
        `${label}: provide an email address or a WhatsApp number.`
      );
    }
    const method = methodFor(request);
    if (method.notification_method === 'Email' && !email) {
      throw new Error(
        `${label}: the chosen verification sends the invitation by email, so an email address is required.`
      );
    }
    if (method.notification_method === 'Whatsapp' && !whatsapp) {
      throw new Error(
        `${label}: the chosen verification sends the invitation by WhatsApp, so a WhatsApp number is required.`
      );
    }
    if (governmentId && !assinafyValues.isGovernmentId(governmentId)) {
      throw new Error(
        `${label}: ${governmentId} is not a valid CPF (11 digits) or CNPJ (14 digits).`
      );
    }
    const earlier = requests.slice(0, index);
    if (
      email &&
      earlier.some(
        (other) => other.email?.toLowerCase() === email.toLowerCase()
      )
    ) {
      throw new Error(`${label} repeats the email address ${email}.`);
    }
    if (
      whatsapp &&
      earlier.some(
        (other) =>
          assinafyValues.sameWhatsapp({
            stored: other.whatsapp,
            given: whatsapp,
          }) ||
          assinafyValues.sameWhatsapp({
            stored: whatsapp,
            given: other.whatsapp,
          })
      )
    ) {
      throw new Error(`${label} repeats the WhatsApp number ${whatsapp}.`);
    }
  }
}

function validateSigningOrder(requests: SignerRequest[]): void {
  const withStep = requests
    .map((request) => request.step)
    .filter((step): step is number => step !== undefined);
  if (withStep.length > 0 && withStep.length !== requests.length) {
    throw new Error(
      'Set the signing order on every signer, or on none of them.'
    );
  }
  for (let step = 1; step <= Math.max(0, ...withStep); step++) {
    if (!withStep.includes(step)) {
      throw new Error(
        `The signing order must start at 1 and have no gaps; no signer has step ${step}.`
      );
    }
  }
  for (const request of requests) {
    const sharesStep = requests.some(
      (other) => other !== request && (other.step ?? 1) === (request.step ?? 1)
    );
    if (methodFor(request).certificate && sharesStep) {
      throw new Error(
        `${request.label}: a digital certificate signer must be the only signer in their signing order step. Set Signing Order so no one else shares it.`
      );
    }
  }
}

async function findSigner({
  client,
  signersPath,
  request,
}: {
  client: AssinafyClient;
  signersPath: string;
  request: SignerRequest;
}): Promise<ApiSigner | undefined> {
  const search = request.email ?? request.fullName;
  if (!search) {
    return undefined;
  }
  const email = request.email?.toLowerCase();
  const matches = (signer: ApiSigner) =>
    email
      ? signer.email?.toLowerCase() === email
      : assinafyValues.sameWhatsapp({
          stored: signer.whatsapp_phone_number,
          given: request.whatsapp,
        });
  const candidates = await client.listAll<ApiSigner>({
    request: {
      method: HttpMethod.GET,
      path: signersPath,
      queryParams: { search },
    },
    maxItems: MAX_SEARCH_RESULTS,
    until: matches,
  });
  return candidates.find(matches);
}

async function planSigner({
  client,
  signersPath,
  request,
}: {
  client: AssinafyClient;
  signersPath: string;
  request: SignerRequest;
}): Promise<SignerPlan> {
  const { label, fullName, email, whatsapp, governmentId } = request;
  if (!email && !fullName) {
    throw new Error(
      `${label}: add the Full Name. Signers without an email address are found by their name and WhatsApp number.`
    );
  }
  const existing = await findSigner({ client, signersPath, request });
  const who = email ?? fullName ?? whatsapp;
  if (!existing) {
    if (!fullName) {
      throw new Error(
        `${label}: no signer with ${
          email ?? whatsapp
        } exists yet, so a full name is required to create one.`
      );
    }
    return {
      request,
      existing: undefined,
      create: assinafyValues.compact({
        full_name: fullName,
        email,
        whatsapp_phone_number: whatsapp,
      }),
      updates: assinafyValues.compact({ government_id: governmentId }),
    };
  }
  if (
    existing.whatsapp_phone_number &&
    whatsapp &&
    !assinafyValues.sameWhatsapp({
      stored: existing.whatsapp_phone_number,
      given: whatsapp,
    })
  ) {
    throw new Error(
      `${label}: ${who} is saved in Assinafy with a different WhatsApp number. Change it with Update Signer, or leave WhatsApp Number empty to use the saved one.`
    );
  }
  return {
    request,
    existing,
    create: undefined,
    updates: assinafyValues.compact({
      whatsapp_phone_number:
        whatsapp && !existing.whatsapp_phone_number ? whatsapp : undefined,
    }),
  };
}

async function applyPlan({
  client,
  signersPath,
  plan,
}: {
  client: AssinafyClient;
  signersPath: string;
  plan: SignerPlan;
}): Promise<ApiSigner> {
  if (plan.existing) {
    return Object.keys(plan.updates).length === 0
      ? plan.existing
      : client.request<ApiSigner>({
          method: HttpMethod.PUT,
          path: `${signersPath}/${encodeURIComponent(plan.existing.id)}`,
          body: plan.updates,
        });
  }
  const created = await tryCatch(() =>
    client.request<ApiSigner>({
      method: HttpMethod.POST,
      path: signersPath,
      body: plan.create,
    })
  );
  if (created.error) {
    const createdMeanwhile =
      created.error instanceof AssinafyApiError &&
      created.error.status < 500 &&
      plan.request.email
        ? await findSigner({ client, signersPath, request: plan.request })
        : undefined;
    if (createdMeanwhile) {
      return createdMeanwhile;
    }
    throw created.error;
  }
  const signer = created.data;
  if (Object.keys(plan.updates).length === 0) {
    return signer;
  }
  return client.request<ApiSigner>({
    method: HttpMethod.PUT,
    path: `${signersPath}/${encodeURIComponent(signer.id)}`,
    body: plan.updates,
  });
}

async function resolveAll({
  client,
  requests,
}: {
  client: AssinafyClient;
  requests: SignerRequest[];
}): Promise<{ request: SignerRequest; signer: ApiSigner }[]> {
  const signersPath = await client.accountPath('/signers');
  const plans: SignerPlan[] = [];
  for (const request of requests) {
    const plan = await planSigner({ client, signersPath, request });
    const earlier =
      plan.existing &&
      plans.find((other) => other.existing?.id === plan.existing?.id);
    if (earlier) {
      throw new Error(
        `${request.label} is the same person as ${earlier.request.label}.`
      );
    }
    plans.push(plan);
  }
  const resolved: { request: SignerRequest; signer: ApiSigner }[] = [];
  for (const plan of plans) {
    resolved.push({
      request: plan.request,
      signer: await applyPlan({ client, signersPath, plan }),
    });
  }
  return resolved;
}

function assignmentFields(request: SignerRequest) {
  const method = methodFor(request);
  return {
    verification_method: method.verification_method,
    notification_methods: [method.notification_method],
    ...assinafyValues.compact({ step: request.step }),
  };
}

const MAX_SEARCH_RESULTS = 250;

export const assinafySigners = {
  assignmentFields,
  requestFromRow,
  resolveAll,
  validateContacts,
  validateSigningOrder,
};

export type SignerRequest = {
  label: string;
  fullName?: string;
  email?: string;
  whatsapp?: string;
  governmentId?: string;
  verification?: string;
  step?: number;
};

type SignerPlan = {
  request: SignerRequest;
  existing: ApiSigner | undefined;
  create: Record<string, unknown> | undefined;
  updates: Record<string, unknown>;
};
