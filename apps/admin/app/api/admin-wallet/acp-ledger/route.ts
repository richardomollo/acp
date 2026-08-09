import { NextRequest, NextResponse } from 'next/server';

import { proxyAdminWalletRequest } from '@/app/lib/admin-wallet-api';

export async function GET(request: NextRequest) {
  try {
    const result = await proxyAdminWalletRequest('/api/admin/acp/ledger', {
      searchParams: request.nextUrl.searchParams,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ACP ledger.' },
      { status: 500 }
    );
  }
}
