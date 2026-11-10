import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from './errors.js';
export const validate=(schema:ZodSchema)=>(req:Request,res:Response,next:NextFunction)=>{const parsed=schema.safeParse({body:req.body,params:req.params,query:req.query});if(!parsed.success)return next(new AppError(400,'VALIDATION_ERROR','Request validation failed',parsed.error.flatten()));Object.assign(req,{validated:parsed.data});next();};
declare global { namespace Express { interface Request { user?:{id:string;role:'ADMIN'|'RIDER'|'CUSTOMER'}; requestId?:string; validated?:unknown; } } }
