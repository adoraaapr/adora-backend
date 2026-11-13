import {prisma} from '../config/db.js';
import {AppError, conflict, notFound, badRequest} from '../lib/errors.js';
import {pagination} from '../repositories/common.repository.js';
import {calculateDistance, validateRiderCount, calculatePayoutPaise} from './fraud.service.js';
import {env} from '../config/env.js';
import {redis} from '../config/redis.js';

export const operationsService = {
  async listPlans(query: Record<string, unknown> = {}) {
    const {page, pageSize, skip} = pagination(query);
    const where = {
      ...(query.includeInactive === 'true' ? {} : {active: true, deletedAt: null})
    };
    const [items, total] = await Promise.all([
      prisma.adPlan.findMany({where, skip, take: pageSize, orderBy: {createdAt: 'desc'}}),
      prisma.adPlan.count({where})
    ]);
    return {
      items: items.map(p => ({...p, pricePaise: p.pricePaise.toString()})),
      pagination: {page, pageSize, total, totalPages: Math.ceil(total / pageSize)}
    };
  },

  async createPlan(input: {
    name: string;
    description?: string;
    durationDays: number;
    ridersCount: number;
    pricePaise: string;
    ratePerKmPaise: number;
  }) {
    const plan = await prisma.adPlan.create({
      data: {...input, pricePaise: BigInt(input.pricePaise)}
    });
    await redis.del('adora:cache:plans:public');
    return plan;
  },

  async updatePlan(
    id: string,
    input: Partial<{
      name: string;
      description: string;
      durationDays: number;
      ridersCount: number;
      pricePaise: string;
      ratePerKmPaise: number;
      active: boolean;
    }>
  ) {
    const exists = await prisma.adPlan.findUnique({where: {id}});
    if (!exists) throw notFound('Plan not found');
    const {pricePaise, ...rest} = input;
    const plan = await prisma.adPlan.update({
      where: {id},
      data: {...rest, ...(pricePaise !== undefined ? {pricePaise: BigInt(pricePaise)} : {})}
    });
    await redis.del('adora:cache:plans:public');
    return plan;
  },

  async listAds(query: Record<string, unknown>) {
    const {page, pageSize, skip} = pagination(query);
    const status = typeof query.status === 'string' ? query.status : undefined;
    const where = status ? {status: status as never} : {};
    const [items, total] = await Promise.all([
      prisma.ad.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {createdAt: 'desc'},
        include: {
          customer: {select: {id: true, name: true, phone: true, email: true, company: true}},
          plan: true,
          order: {select: {amountPaise: true, razorpayPaymentId: true, status: true}},
          assignments: {include: {rider: {select: {id: true, name: true, phone: true}}}}
        }
      }),
      prisma.ad.count({where})
    ]);
    return {
      items: items.map(a => ({
        ...a,
        order: {...a.order, amountPaise: a.order.amountPaise.toString()},
        plan: {...a.plan, pricePaise: a.plan.pricePaise.toString()}
      })),
      pagination: {page, pageSize, total, totalPages: Math.ceil(total / pageSize)}
    };
  },

  async approveAd(id: string, actorId: string, requestId?: string) {
    return prisma.$transaction(async tx => {
      const ad = await tx.ad.findUnique({
        where: {id},
        select: {id: true, status: true}
      });
      if (!ad || ad.status !== 'PENDING_APPROVAL') {
        throw conflict('Ad is not awaiting approval');
      }
      const updated = await tx.ad.update({
        where: {id},
        data: {status: 'APPROVED'}
      });
      await tx.auditLog.create({
        data: {actorId, action: 'AD_APPROVED', entityType: 'Ad', entityId: id, requestId}
      });
      return updated;
    });
  },

  async assignRiders(
    adId: string,
    riderIds: string[],
    city: string | undefined,
    actorId: string,
    requestId?: string
  ) {
    if (new Set(riderIds).size !== riderIds.length) {
      throw badRequest('Duplicate rider IDs are not allowed');
    }
    return prisma.$transaction(async tx => {
      const ad = await tx.ad.findUnique({
        where: {id: adId},
        select: {id: true, status: true, planId: true}
      });
      if (!ad || ad.status !== 'APPROVED') {
        throw conflict('Ad must be approved before assignment');
      }
      const plan = await tx.adPlan.findUniqueOrThrow({where: {id: ad.planId}});
      validateRiderCount(riderIds.length, plan.ridersCount);
      const riders = await tx.rider.findMany({
        where: {userId: {in: riderIds}, status: 'ACTIVE', deletedAt: null, ...(city ? {city} : {})}
      });
      if (riders.length !== riderIds.length) {
        throw badRequest('All riders must be active and match the selected city');
      }
      for (const rid of riderIds) {
        const active = await tx.adAssignment.count({
          where: {riderId: rid, status: 'ACTIVE', ad: {status: 'RUNNING'}}
        });
        if (active >= 5) throw conflict(`Rider ${rid} has reached the active-ad limit`);
        await tx.adAssignment.create({data: {adId, riderId: rid}});
      }
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + plan.durationDays);
      const updated = await tx.ad.update({
        where: {id: adId},
        data: {status: 'RUNNING', startDate: start, endDate: end}
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'RIDERS_ASSIGNED',
          entityType: 'Ad',
          entityId: adId,
          requestId,
          metadata: {riderIds}
        }
      });
      return updated;
    });
  },

  async listRiders(query: Record<string, unknown>) {
    const {page, pageSize, skip} = pagination(query);
    const where = {
      ...(typeof query.status === 'string' ? {status: query.status as never} : {}),
      ...(typeof query.city === 'string' ? {city: query.city} : {})
    };
    const [items, total] = await Promise.all([
      prisma.rider.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: {user: {createdAt: 'desc'}},
        include: {
          user: {select: {id: true, name: true, phone: true, email: true, createdAt: true}}
        }
      }),
      prisma.rider.count({where})
    ]);
    return {items, pagination: {page, pageSize, total, totalPages: Math.ceil(total / pageSize)}};
  },

  async updateRider(
    id: string,
    status: 'PENDING' | 'ACTIVE' | 'BLOCKED',
    actorId: string,
    requestId?: string
  ) {
    return prisma.$transaction(async tx => {
      const r = await tx.rider.findUnique({where: {userId: id}});
      if (!r) throw notFound('Rider not found');
      const updated = await tx.rider.update({where: {userId: id}, data: {status}});
      await tx.auditLog.create({
        data: {
          actorId,
          action: `RIDER_${status}`,
          entityType: 'Rider',
          entityId: id,
          requestId,
          metadata: {previousStatus: r.status, status}
        }
      });
      return updated;
    });
  },

  async startLog(
    riderId: string,
    input: {
      adId: string;
      startKm: number;
      startPhotoUrl: string;
      startPhotoPublicId: string;
      adPhotoUrl?: string;
      adPhotoPublicId?: string;
    }
  ) {
    const assignment = await prisma.adAssignment.findFirst({
      where: {riderId, adId: input.adId, status: 'ACTIVE', ad: {status: 'RUNNING'}}
    });
    if (!assignment) throw new AppError(403, 'AD_NOT_ASSIGNED', 'No active assignment for this ad');
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    try {
      return await prisma.dailyLog.create({
        data: {
          riderId,
          adId: input.adId,
          logDate: date,
          startKm: input.startKm,
          startPhotoUrl: input.startPhotoUrl,
          startPhotoPublicId: input.startPhotoPublicId,
          adPhotoUrl: input.adPhotoUrl,
          adPhotoPublicId: input.adPhotoPublicId
        }
      });
    } catch (e) {
      if ((e as {code?: string}).code === 'P2002') {
        throw conflict('A log already exists for this rider, ad, and day');
      }
      throw e;
    }
  },

  async endLog(
    riderId: string,
    logId: string,
    endKm: number,
    photoUrl: string,
    photoPublicId: string,
    adPhotoUrl?: string,
    adPhotoPublicId?: string
  ) {
    return prisma.$transaction(async tx => {
      const log = await tx.dailyLog.findFirst({
        where: {id: logId, riderId},
        select: {
          id: true,
          startKm: true,
          endKm: true,
          status: true,
          logDate: true,
          adId: true
        }
      });
      if (!log || log.endKm !== null) {
        throw conflict('Log is missing or already ended');
      }
      const distance = calculateDistance(Number(log.startKm), endKm, env.DAILY_KM_CAP);
      const count = await tx.dailyLog.count({
        where: {riderId, logDate: log.logDate, endKm: {not: null}}
      });
      return tx.dailyLog.update({
        where: {id: logId},
        data: {
          endKm,
          endPhotoUrl: photoUrl,
          endPhotoPublicId: photoPublicId,
          ...(adPhotoUrl ? {adPhotoUrl, adPhotoPublicId} : {}),
          suspicious: count >= 1 || distance.suspicious,
          suspiciousReason: count >= 1 ? 'Multiple completed ads in one day' : distance.suspiciousReason
        }
      });
    });
  },

  async verifyLog(
    id: string,
    status: 'VERIFIED' | 'REJECTED',
    note: string | undefined,
    actorId: string,
    requestId?: string
  ) {
    return prisma.$transaction(async tx => {
      const row = await tx.dailyLog.findUnique({
        where: {id},
        select: {id: true, status: true, endKm: true, suspicious: true}
      });
      if (!row || row.endKm === null) throw notFound('Completed log not found');
      if (row.status !== 'SUBMITTED') throw conflict('Only submitted logs can be reviewed');
      const updated = await tx.dailyLog.update({where: {id}, data: {status, adminNote: note}});
      await tx.auditLog.create({
        data: {
          actorId,
          action: `LOG_${status}`,
          entityType: 'DailyLog',
          entityId: id,
          requestId,
          metadata: {note, suspicious: row.suspicious}
        }
      });
      return updated;
    });
  },

  async generatePayouts(start: string, end: string, actorId: string, requestId?: string) {
    const a = new Date(start);
    const b = new Date(end);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || a > b) {
      throw badRequest('Invalid payout period');
    }
    return prisma.$transaction(async tx => {
      const logs = await tx.dailyLog.findMany({
        where: {status: 'VERIFIED', logDate: {gte: a, lte: b}, endKm: {not: null}},
        include: {ad: {include: {plan: true}}}
      });
      const grouped = new Map<string, {km: number; amountPaise: number}>();
      for (const l of logs) {
        const current = grouped.get(l.riderId);
        const km = Number(l.endKm) - Number(l.startKm);
        const amount = calculatePayoutPaise(km, l.ad.plan.ratePerKmPaise);
        grouped.set(l.riderId, {
          km: (current?.km || 0) + km,
          amountPaise: (current?.amountPaise || 0) + amount
        });
      }
      let generated = 0;
      for (const [riderId, g] of grouped) {
        const user = await tx.user.findUnique({where: {id: riderId}, select: {id: true}});
        if (!user) continue;
        const overlap = await tx.payout.findFirst({
          where: {riderId, periodStart: {lte: b}, periodEnd: {gte: a}}
        });
        if (overlap) continue;
        await tx.payout.create({
          data: {
            riderId,
            periodStart: a,
            periodEnd: b,
            totalKm: g.km,
            ratePerKmPaise: g.km > 0 ? Math.round(g.amountPaise / g.km) : 0,
            amountPaise: BigInt(g.amountPaise)
          }
        });
        generated++;
      }
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PAYOUTS_GENERATED',
          entityType: 'PayoutPeriod',
          entityId: `${start}:${end}`,
          requestId,
          metadata: {generated}
        }
      });
      return {generated};
    });
  },

  async markPayoutPaid(id: string, reference: string, actorId: string, requestId?: string) {
    if (!reference.trim()) throw badRequest('Payment reference is required');
    return prisma.$transaction(async tx => {
      const p = await tx.payout.findUnique({
        where: {id},
        select: {id: true, status: true, amountPaise: true}
      });
      if (!p) throw notFound('Payout not found');
      if (p.status === 'PAID') throw conflict('Payout already marked paid');
      const updated = await tx.payout.update({
        where: {id},
        data: {status: 'PAID', paidAt: new Date(), reference}
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: 'PAYOUT_MARKED_PAID',
          entityType: 'Payout',
          entityId: id,
          requestId,
          metadata: {reference, amountPaise: p.amountPaise.toString()}
        }
      });
      return updated;
    });
  },

  async dashboard() {
    const [ads, riders, logs, payouts] = await Promise.all([
      prisma.ad.groupBy({by: ['status'], _count: {_all: true}}),
      prisma.rider.groupBy({by: ['status'], _count: {_all: true}}),
      prisma.dailyLog.groupBy({by: ['status'], _count: {_all: true}}),
      prisma.payout.aggregate({
        where: {status: 'PENDING'},
        _sum: {amountPaise: true},
        _count: {_all: true}
      })
    ]);
    return {
      ads,
      riders,
      logs,
      pendingPayouts: {
        count: payouts._count._all,
        amountPaise: (payouts._sum.amountPaise || 0n).toString()
      }
    };
  }
};
