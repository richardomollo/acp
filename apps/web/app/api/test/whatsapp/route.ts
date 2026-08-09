import { NextResponse } from 'next/server';
import { sendWhatsAppTemplateMessage, WhatsAppAPIError } from '@/lib/whatsapp/client';

// Only reachable in non-production environments.
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production.' }, { status: 403 });
  }

  const testPhone = process.env.WHATSAPP_TEST_PHONE;
  if (!testPhone) {
    return NextResponse.json(
      { error: 'Set WHATSAPP_TEST_PHONE in your .env.local to use this route.' },
      { status: 503 }
    );
  }

  try {
    const result = await sendWhatsAppTemplateMessage(testPhone, 'hello_world', 'en');
    return NextResponse.json({
      success: true,
      sentTo: testPhone,
      messageId: result.messages[0]?.id ?? null,
      waId: result.contacts[0]?.wa_id ?? null,
    });
  } catch (err) {
    if (err instanceof WhatsAppAPIError) {
      return NextResponse.json(
        { error: err.message, code: err.raw.error?.code ?? null },
        { status: err.statusCode }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error.' },
      { status: 500 }
    );
  }
}
