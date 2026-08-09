const BASE = 'https://api.safaricom.co.ke'

function getConfig() {
  const consumerKey    = Deno.env.get('DARAJA_CONSUMER_KEY')
  const consumerSecret = Deno.env.get('DARAJA_CONSUMER_SECRET')
  const shortCode      = Deno.env.get('DARAJA_SHORTCODE')
  const passkey        = Deno.env.get('DARAJA_PASSKEY')
  const callbackUrl    = Deno.env.get('DARAJA_CALLBACK_URL')

  if (!consumerKey || !consumerSecret || !shortCode || !passkey || !callbackUrl) {
    throw new Error('Missing Daraja env vars (DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_SHORTCODE, DARAJA_PASSKEY, DARAJA_CALLBACK_URL)')
  }
  return { consumerKey, consumerSecret, shortCode, passkey, callbackUrl }
}

async function getToken(consumerKey: string, consumerSecret: string): Promise<string> {
  const credentials = btoa(`${consumerKey}:${consumerSecret}`)
  const res = await fetch(`${BASE}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Daraja OAuth failed (${res.status}): ${body}`)
  }
  const { access_token } = await res.json()
  return access_token
}

export interface StkPushResult {
  checkoutRequestId: string
  merchantRequestId: string
}

export async function initiateStkPush(opts: {
  phone: string        // 2547XXXXXXXX
  amount: number
  accountRef: string
  description: string
}): Promise<StkPushResult> {
  const { consumerKey, consumerSecret, shortCode, passkey, callbackUrl } = getConfig()
  const token = await getToken(consumerKey, consumerSecret)

  const now = new Date()
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('')

  const password = btoa(`${shortCode}${passkey}${timestamp}`)

  const payload = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(opts.amount),
    PartyA: opts.phone,
    PartyB: shortCode,
    PhoneNumber: opts.phone,
    CallBackURL: callbackUrl,
    AccountReference: opts.accountRef.slice(0, 12),
    TransactionDesc: opts.description.slice(0, 13),
  }

  console.log('[daraja] STK push payload:', JSON.stringify({ ...payload, Password: '***' }))

  const res = await fetch(`${BASE}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({})) as any

  console.log('[daraja] STK push response:', res.status, JSON.stringify(data))

  if (!res.ok || data.ResponseCode !== '0') {
    const msg = data.errorMessage ?? data.ResponseDescription ?? `STK push failed (${res.status})`
    throw new Error(msg)
  }

  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID,
  }
}

export interface B2cResult {
  originatorConversationId: string
  conversationId: string
}

export async function initiateB2C(opts: {
  phone: string       // 2547XXXXXXXX
  amount: number
  remarks: string
  originatorConversationId: string
}): Promise<B2cResult> {
  const { consumerKey, consumerSecret } = getConfig()
  const token = await getToken(consumerKey, consumerSecret)

  const initiatorName      = Deno.env.get('DARAJA_B2C_INITIATOR_NAME')
  const securityCredential = Deno.env.get('DARAJA_B2C_SECURITY_CREDENTIAL')
  const b2cShortCode       = Deno.env.get('DARAJA_B2C_SHORTCODE')
  const resultUrl          = Deno.env.get('DARAJA_B2C_RESULT_URL')
  const queueTimeoutUrl    = Deno.env.get('DARAJA_B2C_QUEUE_TIMEOUT_URL')

  if (!initiatorName || !securityCredential || !b2cShortCode || !resultUrl || !queueTimeoutUrl) {
    throw new Error('Missing B2C env vars (DARAJA_B2C_INITIATOR_NAME, DARAJA_B2C_SECURITY_CREDENTIAL, DARAJA_B2C_SHORTCODE, DARAJA_B2C_RESULT_URL, DARAJA_B2C_QUEUE_TIMEOUT_URL)')
  }

  const payload = {
    OriginatorConversationID: opts.originatorConversationId,
    InitiatorName:            initiatorName,
    SecurityCredential:       securityCredential,
    CommandID:                'BusinessPayment',
    Amount:                   Math.round(opts.amount),
    PartyA:                   b2cShortCode,
    PartyB:                   opts.phone,
    Remarks:                  opts.remarks.slice(0, 100),
    QueueTimeOutURL:          queueTimeoutUrl,
    ResultURL:                resultUrl,
    Occasion:                 '',
  }

  console.log('[daraja] B2C payload:', JSON.stringify({ ...payload, SecurityCredential: '***' }))

  const res = await fetch(`${BASE}/mpesa/b2c/v3/paymentrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({})) as any
  console.log('[daraja] B2C response:', res.status, JSON.stringify(data))

  if (!res.ok || data.ResponseCode !== '0') {
    const msg = data.errorMessage ?? data.ResponseDescription ?? `B2C failed (${res.status})`
    throw new Error(msg)
  }

  return {
    originatorConversationId: data.OriginatorConversationID,
    conversationId:           data.ConversationID,
  }
}

export interface B2bResult {
  originatorConversationId: string
  conversationId: string
}

export async function initiateB2B(opts: {
  destinationShortCode: string  // receiving paybill/business shortcode
  accountReference: string     // account number posted to the receiving paybill
  amount: number
  remarks: string
  originatorConversationId: string
}): Promise<B2bResult> {
  const { consumerKey, consumerSecret } = getConfig()
  const token = await getToken(consumerKey, consumerSecret)

  const initiatorName      = Deno.env.get('DARAJA_B2B_INITIATOR_NAME')
  const securityCredential = Deno.env.get('DARAJA_B2B_SECURITY_CREDENTIAL')
  const b2bShortCode       = Deno.env.get('DARAJA_B2B_SHORTCODE')
  const resultUrl          = Deno.env.get('DARAJA_B2B_RESULT_URL')
  const queueTimeoutUrl    = Deno.env.get('DARAJA_B2B_QUEUE_TIMEOUT_URL')

  if (!initiatorName || !securityCredential || !b2bShortCode || !resultUrl || !queueTimeoutUrl) {
    throw new Error('Missing B2B env vars (DARAJA_B2B_INITIATOR_NAME, DARAJA_B2B_SECURITY_CREDENTIAL, DARAJA_B2B_SHORTCODE, DARAJA_B2B_RESULT_URL, DARAJA_B2B_QUEUE_TIMEOUT_URL)')
  }

  const payload = {
    Initiator:                initiatorName,
    SecurityCredential:       securityCredential,
    CommandID:                'BusinessPayBill',
    SenderIdentifierType:     '4',
    RecieverIdentifierType:   '4',
    Amount:                   Math.round(opts.amount),
    PartyA:                   b2bShortCode,
    PartyB:                   opts.destinationShortCode,
    AccountReference:         opts.accountReference.slice(0, 13),
    Requester:                '',
    Remarks:                  opts.remarks.slice(0, 100),
    QueueTimeOutURL:          queueTimeoutUrl,
    ResultURL:                resultUrl,
    OriginatorConversationID: opts.originatorConversationId,
  }

  console.log('[daraja] B2B payload:', JSON.stringify({ ...payload, SecurityCredential: '***' }))

  const res = await fetch(`${BASE}/mpesa/b2b/v1/paymentrequest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({})) as any
  console.log('[daraja] B2B response:', res.status, JSON.stringify(data))

  if (!res.ok || data.ResponseCode !== '0') {
    const msg = data.errorMessage ?? data.ResponseDescription ?? `B2B failed (${res.status})`
    throw new Error(msg)
  }

  return {
    originatorConversationId: data.OriginatorConversationID,
    conversationId:           data.ConversationID,
  }
}

export async function registerC2bUrl(opts: {
  confirmationUrl: string
  validationUrl?: string
}): Promise<void> {
  const { consumerKey, consumerSecret, shortCode } = getConfig()
  const token = await getToken(consumerKey, consumerSecret)

  const payload = {
    ShortCode: shortCode,
    ResponseType: 'Completed',
    ConfirmationURL: opts.confirmationUrl,
    ValidationURL: opts.validationUrl ?? opts.confirmationUrl,
  }

  console.log('[daraja] registering C2B URL:', JSON.stringify(payload))

  const res = await fetch(`${BASE}/mpesa/c2b/v2/registerurl`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({})) as any
  console.log('[daraja] C2B registration response:', res.status, JSON.stringify(data))

  if (!res.ok) {
    throw new Error(data.errorMessage ?? data.ResponseDescription ?? `C2B registration failed (${res.status})`)
  }
}
