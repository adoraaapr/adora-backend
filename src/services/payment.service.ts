import {randomUUID, createHmac} from 'node:crypto';
import {verifyCheckoutSignature, verifyWebhookSignature} from '../lib/razorpay-signature.js';
import {prisma} from '../config/db.js';
import {razorpay} from '../config/providers.js';
import {env} from '../config/env.js';
import {AppError, notFound, conflict} from '../lib/errors.js';

export const paymentService = {
  async createOrder(customerId: string, planId: string, idempotencyKey?: string) {
    if (idempotencyKey) {
      const prior = await prisma.order.findUnique({where: {idempotencyKey}});
      if (prior) {
        if (prior.customerId !== customerId) {
          throw conflict('Idempotency key already used', 'IDEMPOTENCY_CONFLICT');
        }
        return {
          order: {...prior, amountPaise: prior.amountPaise.toString()},
          razorpay: {
            id: prior.razorpayOrderId,
            amount: Number(prior.amountPaise),
            currency: prior.currency
          },
          key: env.RAZORPAY_KEY_ID
        };
      }
    }
    const plan = await prisma.adPlan.findFirst({
      where: {id: planId, active: true, deletedAt: null}
    });
    if (!plan) throw notFound('Active plan not found');
    const amount = Number(plan.pricePaise);
    if (!Number.isSafeInteger(amount) || amount < 1) {
      throw new AppError(422, 'INVALID_PLAN_PRICE', 'Plan price must be a positive safe integer amount in paise');
    }
    if (idempotencyKey && idempotencyKey.length > 100) {
      throw new AppError(400, 'INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must be at most 100 characters');
    }
    const receipt = `ad_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt,
      notes: {customerId, planId}
    });
    const saved = await prisma.order.create({
      data: {
        customerId,
        planId,
        amountPaise: plan.pricePaise,
        razorpayOrderId: order.id,
        idempotencyKey
      }
    });
    return {
      order: {...saved, amountPaise: saved.amountPaise.toString()},
      razorpay: {id: order.id, amount: order.amount, currency: order.currency},
      key: env.RAZORPAY_KEY_ID
    };
  },

  verifySignature(orderId: string, paymentId: string, signature: string) {
    if (!verifyCheckoutSignature(env.RAZORPAY_KEY_SECRET, orderId, paymentId, signature)) {
      throw new AppError(400, 'PAYMENT_SIGNATURE_INVALID', 'Payment signature is invalid');
    }
  },

  async markPaid(orderId: string, paymentId: string) {
    return prisma.$transaction(async tx => {
      const o = await tx.order.findUnique({
        where: {razorpayOrderId: orderId},
        select: {id: true, customerId: true, planId: true, status: true, razorpayPaymentId: true}
      });
      if (!o) throw notFound('Order not found');
      if (o.status === 'PAID') {
        if (o.razorpayPaymentId !== paymentId) {
          throw conflict('Order already paid with a different payment', 'PAYMENT_MISMATCH');
        }
        return tx.ad.findUnique({where: {orderId: o.id}});
      }
      const updated = await tx.order.updateMany({
        where: {id: o.id, status: 'CREATED'},
        data: {status: 'PAID', razorpayPaymentId: paymentId}
      });
      if (!updated.count) {
        const existing = await tx.ad.findUnique({where: {orderId: o.id}});
        if (existing) return existing;
        throw conflict('Order is not payable', 'ORDER_STATE_CONFLICT');
      }
      return tx.ad.create({
        data: {
          customerId: o.customerId,
          orderId: o.id,
          planId: o.planId,
          status: 'PENDING_APPROVAL'
        }
      });
    });
  },

  async webhook(
    raw: Buffer,
    signature: string | undefined,
    eventId: string | undefined,
    eventType: string | undefined,
    payload: unknown
  ) {
    if (!signature) throw new AppError(400, 'WEBHOOK_SIGNATURE_MISSING', 'Missing webhook signature');
    if (!verifyWebhookSignature(env.RAZORPAY_WEBHOOK_SECRET, raw, signature)) {
      throw new AppError(400, 'WEBHOOK_SIGNATURE_INVALID', 'Webhook signature invalid');
    }
    const id = eventId || createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    try {
      await prisma.webhookEvent.create({
        data: {eventId: id, eventType: eventType || 'unknown', payload: payload as never}
      });
    } catch (e) {
      if ((e as {code?: string}).code === 'P2002') return {received: true, duplicate: true};
      throw e;
    }
    try {
      const p = payload as {
        payload?: {
          payment?: {entity?: {order_id?: string; id?: string; status?: string}};
          refund?: {entity?: {payment_id?: string; id?: string}};
        };
      };
      const payment = p.payload?.payment?.entity;
      const refund = p.payload?.refund?.entity;
      if (eventType === 'payment.captured' && payment?.order_id && payment.id) {
        await this.markPaid(payment.order_id, payment.id);
      }
      if (eventType === 'payment.failed' && payment?.order_id) {
        await prisma.order.updateMany({
          where: {razorpayOrderId: payment.order_id, status: 'CREATED'},
          data: {status: 'FAILED', failureReason: 'Razorpay payment failed'}
        });
      }
      if (eventType === 'refund.processed' && refund?.payment_id) {
        await prisma.order.updateMany({
          where: {razorpayPaymentId: refund.payment_id, status: 'REFUND_PENDING'},
          data: {status: 'REFUNDED'}
        });
      }
      await prisma.webhookEvent.update({where: {eventId: id}, data: {processedAt: new Date()}});
      return {received: true};
    } catch (e) {
      await prisma.webhookEvent.update({
        where: {eventId: id},
        data: {attempts: {increment: 1}, lastError: String(e).slice(0, 490)}
      });
      throw e;
    }
  },

  async rejectAndRefund(adId: string, reason: string, actorId: string, requestId?: string) {
    const ad = await prisma.ad.findUnique({where: {id: adId}, include: {order: true}});
    if (!ad || ad.status !== 'PENDING_APPROVAL') throw conflict('Ad is not awaiting approval');
    if (!ad.order.razorpayPaymentId) throw conflict('Paid payment reference missing');
    const refund = await razorpay.payments.refund(ad.order.razorpayPaymentId, {
      notes: {adId, reason}
    });
    await prisma.$transaction(async tx => {
      await tx.order.update({where: {id: ad.orderId}, data: {status: 'REFUND_PENDING'}});
      await tx.ad.update({
        where: {id: adId},
        data: {status: 'REJECTED', rejectionReason: reason}
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'AD_REJECT_REFUND_REQUESTED',
          entityType: 'Ad',
          entityId: adId,
          requestId,
          metadata: {reason, refundId: refund.id}
        }
      });
    });
    return {status: 'refund_requested', refundId: refund.id};
  }
};
