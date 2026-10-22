import { formatNaira } from './money.js';

type Data = Record<string, unknown>;
const s = (v: unknown) => String(v ?? '');

/**
 * Plain-English message text per template (NFR-USE-03). SMS stays short;
 * email reuses the same line for now, until Resend templates exist (ticket 2.0).
 */
const TEMPLATES: Record<string, (d: Data) => string> = {
  otp: (d) => `Your SideHustle code is ${s(d.code)}. It expires in 10 minutes. Never share it.`,
  verify_email: (d) => `Confirm your SideHustle email: ${s(d.link)}`,
  password_reset: (d) => `Reset your SideHustle password: ${s(d.link)} (valid for 1 hour)`,
  order_paid: (d) =>
    `Payment received for order ${s(d.ref)} (${formatNaira(Number(d.totalKobo))}). We will tell you when vendors confirm.`,
  fulfilment_confirmed: (d) => `${s(d.vendor)} confirmed your items on order ${s(d.ref)}.`,
  fulfilment_dispatched: (d) =>
    `Items on order ${s(d.ref)} from ${s(d.vendor)} are on the way. Tracking: ${s(d.trackingRef)}.`,
  fulfilment_delivered: (d) => `Items on order ${s(d.ref)} from ${s(d.vendor)} were delivered.`,
  fulfilment_rejected: (d) =>
    `${s(d.vendor)} could not fulfil part of order ${s(d.ref)}. ${formatNaira(Number(d.amountKobo))} will be refunded to you.`,
  order_refunded: (d) => `We refunded ${formatNaira(Number(d.amountKobo))} on order ${s(d.ref)}.`,
  late_payment_refunded: (d) =>
    `Your payment for order ${s(d.ref)} arrived after the order expired and the stock was gone, so we are refunding ${formatNaira(Number(d.amountKobo))} in full.`,
  request_quoted: (d) =>
    `${s(d.vendor)} sent you a quote of ${formatNaira(Number(d.amountKobo))} for your custom request.`,
  request_replied: (d) => `${s(d.vendor)} replied to your custom request.`,
  vendor_new_order: (d) => `New SideHustle order ${s(d.ref)}: please confirm or reject within 24 hours.`,
  vendor_new_request: (d) => `New custom request on SideHustle: ${s(d.projectType)}.`,
  vendor_sla_reminder: (d) => `Reminder: order ${s(d.ref)} is still waiting for your confirmation.`,
  vendor_approved: () => `Your SideHustle vendor account is verified. Your products are now live.`,
};

export function renderTemplate(template: string, data: Data): string {
  const t = TEMPLATES[template];
  if (!t) throw new Error(`Unknown template ${template}`);
  return t(data);
}

export const TEMPLATE_NAMES = Object.keys(TEMPLATES);
