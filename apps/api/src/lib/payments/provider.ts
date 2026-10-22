import { createHmac, timingSafeEqual } from 'node:crypto';

export interface InitializeInput {
  reference: string;
  amountKobo: number;
  email: string;
  /** FR-CHK-03: card and one-time bank transfer account. */
  channels: ('card' | 'bank_transfer')[];
}
export interface InitializeResult {
  authorizationUrl: string;
  accessCode?: string;
}
export interface VerifyResult {
  status: 'success' | 'failed' | 'abandoned' | 'pending';
  amountKobo: number;
  currency: string;
  channel?: string;
  paidAt?: Date;
}
export interface PaymentEvent {
  kind: 'charge.success' | 'other';
  reference: string;
  amountKobo: number;
  currency: string;
  channel?: string;
  raw: unknown;
}

/** Plan section 1: Paystack first, behind an interface; Flutterwave later. */
export interface PaymentProvider {
  readonly name: 'paystack' | 'flutterwave' | 'dev';
  initialize(input: InitializeInput): Promise<InitializeResult>;
  verify(reference: string): Promise<VerifyResult>;
  refund(reference: string, amountKobo: number): Promise<{ providerRef: string }>;
  /** Verifies the webhook signature over the exact raw body. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
  parseWebhook(body: unknown): PaymentEvent;
}

export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack' as const;
  constructor(
    private readonly secret: string,
    private readonly callbackUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`https://api.paystack.co${path}`, {
      method,
      headers: { authorization: `Bearer ${this.secret}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json()) as { status: boolean; message: string; data: T };
    if (!res.ok || !json.status) throw new Error(`Paystack ${path}: ${json.message}`);
    return json.data;
  }

  async initialize(i: InitializeInput) {
    const d = await this.call<{ authorization_url: string; access_code: string }>(
      'POST',
      '/transaction/initialize',
      {
        reference: i.reference,
        amount: i.amountKobo,
        email: i.email,
        currency: 'NGN',
        channels: i.channels,
        callback_url: `${this.callbackUrl}/${i.reference}`,
      },
    );
    return { authorizationUrl: d.authorization_url, accessCode: d.access_code };
  }

  async verify(reference: string): Promise<VerifyResult> {
    const d = await this.call<{
      status: string;
      amount: number;
      currency: string;
      channel: string;
      paid_at: string | null;
    }>('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    const status = (
      ['success', 'failed', 'abandoned'].includes(d.status) ? d.status : 'pending'
    ) as VerifyResult['status'];
    return {
      status,
      amountKobo: d.amount,
      currency: d.currency,
      channel: d.channel,
      ...(d.paid_at ? { paidAt: new Date(d.paid_at) } : {}),
    };
  }

  async refund(reference: string, amountKobo: number) {
    const d = await this.call<{ id: number }>('POST', '/refund', {
      transaction: reference,
      amount: amountKobo,
    });
    return { providerRef: String(d.id) };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    const sig = headers['x-paystack-signature'];
    if (typeof sig !== 'string') return false;
    const expected = createHmac('sha512', this.secret).update(rawBody).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): PaymentEvent {
    const b = body as {
      event?: string;
      data?: { reference?: string; amount?: number; currency?: string; channel?: string };
    };
    return {
      kind: b.event === 'charge.success' ? 'charge.success' : 'other',
      reference: String(b.data?.reference ?? ''),
      amountKobo: Number(b.data?.amount ?? 0),
      currency: String(b.data?.currency ?? ''),
      ...(b.data?.channel ? { channel: b.data.channel } : {}),
      raw: body,
    };
  }
}

/**
 * Local and test stand-in for Paystack (no keys yet, ticket 0.9 Part B). Its
 * "checkout" is a web page that calls the dev completion endpoint, which runs
 * the same payment-success path as a verified webhook. Refused in production.
 */
export class DevProvider implements PaymentProvider {
  readonly name = 'dev' as const;
  readonly paid = new Map<string, number>();
  constructor(private readonly webOrigin: string) {}
  async initialize(i: InitializeInput) {
    return { authorizationUrl: `${this.webOrigin}/pay/dev/${i.reference}` };
  }
  async verify(reference: string): Promise<VerifyResult> {
    const amount = this.paid.get(reference);
    return amount === undefined
      ? { status: 'pending', amountKobo: 0, currency: 'NGN' }
      : { status: 'success', amountKobo: amount, currency: 'NGN', channel: 'dev' };
  }
  async refund(reference: string) {
    return { providerRef: `dev-refund-${reference}-${Date.now()}` };
  }
  verifyWebhook() {
    return false;
  }
  parseWebhook(body: unknown): PaymentEvent {
    return { kind: 'other', reference: '', amountKobo: 0, currency: 'NGN', raw: body };
  }
}
