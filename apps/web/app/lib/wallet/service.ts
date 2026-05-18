import 'server-only';

const DEFAULT_TIMEOUT_MS = 15000;

export interface WalletRecord {
  walletId: string;
  walletAcc: string;
  emailAddress: string;
  currency: string;
  status: string;
  balance: string;
  createdAt: string;
}

export interface WalletBalance {
  balance: string;
  currency: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: string;
  status: string;
  provider: string | null;
  amount: string;
  currency: string;
  providerReference: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface MpesaTopupResponse {
  transactionId: string;
  status: string;
  providerReference: string | null;
  message: string;
}

export interface WalletSummary {
  wallet: WalletRecord;
  balance: WalletBalance;
  transactions: WalletTransaction[];
}

export interface MpesaTopupInput {
  emailAddress: string;
  amount: number | string;
  phone: string;
}

type WalletRequestOptions = {
  allow404?: boolean;
};

class WalletServiceError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'WalletServiceError';
  }
}

function getWalletApiBaseUrl() {
  const baseUrl = process.env.WALLET_API_URL;

  if (!baseUrl) {
    throw new WalletServiceError(
      'Missing WALLET_API_URL environment variable for wallet service.'
    );
  }

  return baseUrl.replace(/\/+$/, '');
}

function buildWalletHeaders(init?: HeadersInit) {
  const headers = new Headers(init);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const bearerToken = process.env.WALLET_API_BEARER_TOKEN;
  if (bearerToken) {
    headers.set('Authorization', `Bearer ${bearerToken}`);
  }

  const apiKey = process.env.WALLET_API_KEY;
  if (apiKey) {
    headers.set(process.env.WALLET_API_KEY_HEADER ?? 'x-api-key', apiKey);
  }

  return headers;
}

async function parseWalletResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

async function walletRequest<T>(
  path: string,
  init?: RequestInit,
  options?: WalletRequestOptions & { allow404?: false }
): Promise<T>;
async function walletRequest<T>(
  path: string,
  init: RequestInit | undefined,
  options: WalletRequestOptions & { allow404: true }
): Promise<T | null>;
async function walletRequest<T>(
  path: string,
  init: RequestInit = {},
  options: WalletRequestOptions = {}
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(`${getWalletApiBaseUrl()}${path}`, {
      ...init,
      headers: buildWalletHeaders(init.headers),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (response.status === 404 && options.allow404) {
      return null;
    }

    const body = await parseWalletResponse(response);

    if (!response.ok) {
      const message =
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
          ? body.message
          : `Wallet request failed with status ${response.status}`;

      throw new WalletServiceError(message, response.status, body);
    }

    return body as T;
  } catch (error) {
    if (error instanceof WalletServiceError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new WalletServiceError('Wallet request timed out.');
    }

    throw new WalletServiceError(
      error instanceof Error ? error.message : 'Wallet request failed.'
    );
  } finally {
    clearTimeout(timeout);
  }
}

function normaliseEmail(emailAddress: string) {
  const email = emailAddress.trim().toLowerCase();

  if (!email) {
    throw new WalletServiceError('Email address is required.');
  }

  return email;
}

function normaliseAmount(amount: number | string) {
  const raw = typeof amount === 'number' ? amount.toString() : amount.trim();
  const numericAmount = Number(raw);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new WalletServiceError('Top-up amount must be greater than zero.');
  }

  return raw;
}

function normaliseMpesaPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');

  if (digits.startsWith('254') && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith('0') && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }

  if ((digits.startsWith('7') || digits.startsWith('1')) && digits.length === 9) {
    return `254${digits}`;
  }

  throw new WalletServiceError(
    'Phone number must be a valid Safaricom M-Pesa number.'
  );
}

async function createWallet(emailAddress: string): Promise<WalletRecord> {
  return walletRequest<WalletRecord>('/api/wallets', {
    method: 'POST',
    body: JSON.stringify({
      emailAddress: normaliseEmail(emailAddress),
    }),
  });
}

async function findWalletByEmail(
  emailAddress: string
): Promise<WalletRecord | null> {
  const email = encodeURIComponent(normaliseEmail(emailAddress));

  return walletRequest<WalletRecord>(
    `/api/wallets/by-email?email=${email}`,
    {
      method: 'GET',
    },
    { allow404: true }
  );
}

async function getWallet(walletId: string): Promise<WalletRecord> {
  if (!walletId.trim()) {
    throw new WalletServiceError('Wallet ID is required.');
  }

  return walletRequest<WalletRecord>(`/api/wallets/${walletId}`, {
    method: 'GET',
  });
}

async function getWalletBalance(walletId: string): Promise<WalletBalance> {
  if (!walletId.trim()) {
    throw new WalletServiceError('Wallet ID is required.');
  }

  return walletRequest<WalletBalance>(`/api/wallets/${walletId}/balance`, {
    method: 'GET',
  });
}

async function getWalletTransactions(
  walletId: string
): Promise<WalletTransaction[]> {
  if (!walletId.trim()) {
    throw new WalletServiceError('Wallet ID is required.');
  }

  return walletRequest<WalletTransaction[]>(
    `/api/wallets/${walletId}/transactions`,
    {
      method: 'GET',
    }
  );
}

async function getOrCreateWalletByEmail(
  emailAddress: string
): Promise<WalletRecord> {
  const existingWallet = await findWalletByEmail(emailAddress);
  return existingWallet ?? createWallet(emailAddress);
}

async function createWalletForNewUser(
  emailAddress: string
): Promise<WalletRecord> {
  return getOrCreateWalletByEmail(emailAddress);
}

async function getWalletSummaryIfExistsByEmail(
  emailAddress: string
): Promise<WalletSummary | null> {
  const wallet = await findWalletByEmail(emailAddress);

  if (!wallet) {
    return null;
  }

  const [balance, transactions] = await Promise.all([
    getWalletBalance(wallet.walletId),
    getWalletTransactions(wallet.walletId),
  ]);

  return {
    wallet,
    balance,
    transactions,
  };
}

async function getWalletSummaryByEmail(emailAddress: string): Promise<WalletSummary> {
  const wallet = await getOrCreateWalletByEmail(emailAddress);

  const [balance, transactions] = await Promise.all([
    getWalletBalance(wallet.walletId),
    getWalletTransactions(wallet.walletId),
  ]);

  return {
    wallet,
    balance,
    transactions,
  };
}

async function topupMpesaForEmail({
  emailAddress,
  amount,
  phone,
}: MpesaTopupInput): Promise<{
  wallet: WalletRecord;
  topup: MpesaTopupResponse;
}> {
  const wallet = await getOrCreateWalletByEmail(emailAddress);

  const topup = await walletRequest<MpesaTopupResponse>(
    '/api/providers/mpesa/topup',
    {
      method: 'POST',
      body: JSON.stringify({
        walletId: wallet.walletId,
        amount: normaliseAmount(amount),
        phone: normaliseMpesaPhone(phone),
      }),
    }
  );

  return {
    wallet,
    topup,
  };
}

export const walletService = {
  createWallet,
  createWalletForNewUser,
  findWalletByEmail,
  getWallet,
  getWalletBalance,
  getWalletTransactions,
  getOrCreateWalletByEmail,
  getWalletSummaryIfExistsByEmail,
  getWalletSummaryByEmail,
  topupMpesaForEmail,
};

export { WalletServiceError };
