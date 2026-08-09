export interface WhatsAppTextParameter {
  type: 'text';
  text: string;
}

export interface WhatsAppImageParameter {
  type: 'image';
  image: { link: string };
}

export interface WhatsAppDocumentParameter {
  type: 'document';
  document: { link: string; filename: string };
}

export interface WhatsAppCurrencyParameter {
  type: 'currency';
  currency: { fallback_value: string; code: string; amount_1000: number };
}

export interface WhatsAppDateTimeParameter {
  type: 'date_time';
  date_time: { fallback_value: string };
}

export type WhatsAppParameter =
  | WhatsAppTextParameter
  | WhatsAppImageParameter
  | WhatsAppDocumentParameter
  | WhatsAppCurrencyParameter
  | WhatsAppDateTimeParameter;

export interface WhatsAppComponent {
  type: 'header' | 'body' | 'button';
  parameters: WhatsAppParameter[];
  sub_type?: 'quick_reply' | 'url';
  index?: number;
}

export interface WhatsAppAPIResponse {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string; message_status?: string }>;
}

export interface WhatsAppErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

export class WhatsAppAPIError extends Error {
  readonly statusCode: number;
  readonly raw: WhatsAppErrorResponse;

  constructor(statusCode: number, raw: WhatsAppErrorResponse) {
    super(`WhatsApp API error ${statusCode}: ${raw.error?.message ?? 'Unknown error'}`);
    this.name = 'WhatsAppAPIError';
    this.statusCode = statusCode;
    this.raw = raw;
  }
}

function getCredentials() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token) throw new Error('Missing env var: WHATSAPP_TOKEN');
  if (!phoneNumberId) throw new Error('Missing env var: WHATSAPP_PHONE_NUMBER_ID');

  return { token, phoneNumberId };
}

export async function sendWhatsAppTemplateMessage(
  phoneNumber: string,
  templateName: string,
  languageCode: string,
  components?: WhatsAppComponent[]
): Promise<WhatsAppAPIResponse> {
  const { token, phoneNumberId } = getCredentials();

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components?.length ? { components } : {}),
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = await response.json();

  if (!response.ok) {
    throw new WhatsAppAPIError(response.status, json as WhatsAppErrorResponse);
  }

  return json as WhatsAppAPIResponse;
}
