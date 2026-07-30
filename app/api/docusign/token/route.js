import { NextResponse } from 'next/server';
import { getAuthenticatedApiClient } from '@/lib/docusign';

// GET /api/docusign/token — confirms JWT auth against DocuSign sandbox works.
export async function GET() {
  try {
    const { accessToken, accountId } = await getAuthenticatedApiClient();
    return NextResponse.json({
      ok: true,
      accountId,
      accessTokenPreview: `${accessToken.slice(0, 12)}...`,
    });
  } catch (err) {
    const details = err?.response?.body || err?.message || String(err);
    return NextResponse.json({ ok: false, error: details }, { status: 500 });
  }
}
