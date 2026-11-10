import { prisma } from '../config/db.js';
export const auditRepository={create:(data:{actorId:string;action:string;entityType:string;entityId:string;metadata?:unknown;requestId?:string})=>prisma.auditLog.create({data:{...data,metadata:data.metadata as never}})};
export function pagination(query:Record<string,unknown>){const page=Math.max(1,Number(query.page)||1);const pageSize=Math.min(100,Math.max(1,Number(query.pageSize)||20));return {page,pageSize,skip:(page-1)*pageSize};}
