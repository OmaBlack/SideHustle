import { pgEnum } from 'drizzle-orm/pg-core';

export const userRole = pgEnum('user_role', ['buyer', 'vendor_staff', 'admin']);
export const vendorStatus = pgEnum('vendor_status', ['pending', 'verified', 'suspended']);
export const kycStatus = pgEnum('kyc_status', ['not_started', 'submitted', 'approved', 'rejected']);
export const vendorStaffRole = pgEnum('vendor_staff_role', ['owner', 'staff']);
export const recordStatus = pgEnum('record_status', ['draft', 'active', 'archived']);
export const fulfilmentMode = pgEnum('fulfilment_mode', ['drop_ship', 'hub']);
export const dealKind = pgEnum('deal_kind', ['promo', 'launch']);
export const dealScope = pgEnum('deal_scope', ['product', 'category']);
export const moderationStatus = pgEnum('moderation_status', ['pending', 'approved', 'rejected']);
export const customRequestStatus = pgEnum('custom_request_status', [
  'new',
  'quoted',
  'accepted',
  'declined',
  'paid',
]);
export const lineType = pgEnum('line_type', ['product', 'kit', 'bundle']);
export const orderStatus = pgEnum('order_status', [
  'pending_payment',
  'paid',
  'expired',
  'in_fulfilment',
  'delivered',
  'completed',
  'disputed',
  'refunded',
  'cancelled',
]);
export const fulfilmentKind = pgEnum('fulfilment_kind', ['vendor', 'hub']);
export const fulfilmentStatus = pgEnum('fulfilment_status', [
  'awaiting_confirmation',
  'confirmed',
  'rejected',
  'dispatched',
  'delivered',
]);
export const paymentProvider = pgEnum('payment_provider', ['paystack', 'flutterwave']);
export const paymentStatus = pgEnum('payment_status', ['pending', 'success', 'failed', 'abandoned']);
export const refundStatus = pgEnum('refund_status', ['pending', 'processed', 'failed']);
export const ledgerAccount = pgEnum('ledger_account', [
  'buyer_clearing',
  'vendor_payable',
  'platform_revenue',
  'platform_discount',
  'provider_fees',
  'refunds',
]);
export const ledgerJournalKind = pgEnum('ledger_journal_kind', [
  'payment',
  'discount',
  'commission',
  'refund',
  'payout',
  'adjustment',
]);
export const fundedBy = pgEnum('funded_by', ['vendor', 'platform']);
export const payoutStatus = pgEnum('payout_status', ['pending', 'processing', 'paid', 'failed']);
export const notificationChannel = pgEnum('notification_channel', ['sms', 'email', 'in_app']);
export const notificationStatus = pgEnum('notification_status', ['queued', 'sent', 'failed']);
export const ruleScope = pgEnum('rule_scope', ['global', 'category', 'vendor']);
export const hubMovementKind = pgEnum('hub_movement_kind', [
  'receipt',
  'adjustment',
  'reservation',
  'release',
  'dispatch',
]);
export const reservationSource = pgEnum('reservation_source', ['drop_ship', 'hub']);
export const reservationStatus = pgEnum('reservation_status', ['active', 'committed', 'released']);
export const licenceStatus = pgEnum('licence_status', ['pending', 'approved', 'rejected', 'expired']);
export const dataRequestKind = pgEnum('data_request_kind', ['export', 'delete']);
export const jobStatus = pgEnum('job_status', ['pending', 'processing', 'done', 'failed']);
export const retentionAction = pgEnum('retention_action', ['archive', 'purge']);
export const emailTokenPurpose = pgEnum('email_token_purpose', ['verify_email', 'reset_password']);
