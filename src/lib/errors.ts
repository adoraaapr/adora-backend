export class AppError extends Error { constructor(public status:number, public code:string, message:string, public details?:unknown){super(message);this.name='AppError';} }
export const badRequest=(m:string,c='BAD_REQUEST')=>new AppError(400,c,m);
export const unauthorized=(m='Authentication required')=>new AppError(401,'UNAUTHORIZED',m);
export const forbidden=(m='Forbidden')=>new AppError(403,'FORBIDDEN',m);
export const notFound=(m='Resource not found')=>new AppError(404,'NOT_FOUND',m);
export const conflict=(m:string,c='CONFLICT')=>new AppError(409,c,m);
