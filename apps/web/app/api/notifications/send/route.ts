import { NextResponse } from 'next/server';
import {
  sendWhatsAppTemplateMessage,
  WhatsAppAPIError,
  type WhatsAppComponent,
} from '@/lib/whatsapp/client';

interface SendNotificationBody {
  phoneNumber: string;
  templateName: string;
  languageCode?: string;
  components?: WhatsAppComponent[];
}

function isE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Request body must be a JSON object.' }, { status: 400 });
  }

  const { phoneNumber, templateName, languageCode = 'en', components } =
    body as SendNotificationBody;

  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return NextResponse.json({ error: 'phoneNumber is required.' }, { status: 422 });
  }
  if (!isE164(phoneNumber)) {
    return NextResponse.json(
      { error: 'phoneNumber must be in E.164 format (e.g. +254712345678).' },
      { status: 422 }
    );
  }
  if (!templateName || typeof templateName !== 'string') {
    return NextResponse.json({ error: 'templateName is required.' }, { status: 422 });
  }
  if (!/^[a-z0-9_]{1,512}$/.test(templateName)) {
    return NextResponse.json(
      { error: 'templateName must contain only lowercase letters, digits, and underscores.' },
      { status: 422 }
    );
  }
  if (components !== undefined && !Array.isArray(components)) {
    return NextResponse.json({ error: 'components must be an array.' }, { status: 422 });
  }

  try {
    const result = await sendWhatsAppTemplateMessage(
      phoneNumber,
      templateName,
      languageCode,
      components
    );

    return NextResponse.json({
      success: true,
      messageId: result.messages[0]?.id ?? null,
      waId: result.contacts[0]?.wa_id ?? null,
    });
  } catch (err) {
    if (err instanceof WhatsAppAPIError) {
      return NextResponse.json(
        {
          error: err.message,
          code: err.raw.error?.code ?? null,
        },
        { status: err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 502 }
      );
    }
    if (err instanceof Error && err.message.startsWith('Missing env var')) {
      console.error('[notifications/send] Configuration error:', err.message);
      return NextResponse.json({ error: 'Service not configured.' }, { status: 503 });
    }
    console.error('[notifications/send] Unexpected error:', err);
    return NextResponse.json({ error: 'Failed to send notification.' }, { status: 500 });
  }
}
