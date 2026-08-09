import 'server-only';

type ProxyOptions = {
  searchParams?: URLSearchParams;
};

function getAdminWalletApiBaseUrl() {
  const baseUrl =
    process.env.WALLET_API_URL ??
    process.env.NEXT_PUBLIC_WALLET_API_URL ??
    process.env.ADMIN_WALLET_API_URL ??
    process.env.NEXT_PUBLIC_ADMIN_WALLET_API_URL;

  if (!baseUrl) {
    throw new Error(
      'Missing wallet admin API base URL. Set WALLET_API_URL or NEXT_PUBLIC_WALLET_API_URL.'
    );
  }

  return baseUrl.replace(/\/+$/, '');
}

export async function proxyAdminWalletRequest(
  path: string,
  options: ProxyOptions = {}
) {
  const query = options.searchParams?.toString();
  const url = `${getAdminWalletApiBaseUrl()}${path}${query ? `?${query}` : ''}`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
    },
  });

  const contentType = response.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : { message: await response.text() };

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
        ? body.message
        : 'Wallet admin request failed.';

    return {
      ok: false,
      status: response.status,
      body: {
        error: message,
        details: body,
      },
    };
  }

  return {
    ok: true,
    status: response.status,
    body,
  };
}
