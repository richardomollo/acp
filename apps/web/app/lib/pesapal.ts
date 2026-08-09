// Required env vars:
//   PESAPAL_CONSUMER_KEY
//   PESAPAL_CONSUMER_SECRET
//   PESAPAL_ENV          "sandbox" | "live"  (defaults to sandbox)

const BASE =
  process.env.PESAPAL_ENV === "live"
    ? "https://pay.pesapal.com/v3"
    : "https://cybqa.pesapal.com/pesapalv3";

async function getToken(): Promise<string> {
  const res = await fetch(`${BASE}/api/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      consumer_key: process.env.PESAPAL_CONSUMER_KEY!,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET!,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PesaPal auth failed: ${await res.text()}`);
  const data = await res.json();
  return data.token as string;
}

async function headers(): Promise<HeadersInit> {
  const token = await getToken();
  return { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` };
}

export interface PesapalOrder {
  id: string;               // merchant_reference — your unique ID
  currency: string;
  amount: number;
  description: string;
  callback_url: string;
  notification_id: string;  // IPN ID from registerIPN()
  billing_address: {
    email_address: string;
    phone_number?: string;
    first_name?: string;
    last_name?: string;
    country_code?: string;
  };
}

export interface SubmitOrderResult {
  order_tracking_id: string;
  merchant_reference: string;
  redirect_url: string;
}

export async function submitOrder(order: PesapalOrder): Promise<SubmitOrderResult> {
  const res = await fetch(`${BASE}/api/Transactions/SubmitOrderRequest`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify(order),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PesaPal submit order failed: ${await res.text()}`);
  return res.json();
}

export type PaymentStatusDescription = "Completed" | "Failed" | "Reversed" | "Invalid" | "Pending";

export interface TransactionStatus {
  payment_method: string;
  amount: number;
  created_date: string;
  confirmation_code: string;
  payment_status_description: PaymentStatusDescription;
  merchant_reference: string;
  currency: string;
}

export async function getTransactionStatus(orderTrackingId: string): Promise<TransactionStatus> {
  const res = await fetch(
    `${BASE}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
    { headers: await headers(), cache: "no-store" },
  );
  if (!res.ok) throw new Error(`PesaPal status check failed: ${await res.text()}`);
  return res.json();
}

export async function registerIPN(ipnUrl: string): Promise<string> {
  const res = await fetch(`${BASE}/api/URLSetup/RegisterIPN`, {
    method: "POST",
    headers: await headers(),
    body: JSON.stringify({ url: ipnUrl, ipn_notification_type: "GET" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`PesaPal IPN registration failed: ${await res.text()}`);
  const data = await res.json();
  return data.ipn_id as string;
}
