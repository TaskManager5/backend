import { randomUUID } from 'crypto';

export function requestId(req,res,next){
  req.traceId = req.headers['x-request-id'] || randomUUID();
  res.setHeader('X-Trace-Id', req.traceId);
  next();
}

export function notFound(req,res,next){
  res.status(404).json({ error:'not_found', traceId:req.traceId });
}

export function errorHandler(err,req,res,next){
  const code = Number(err.status || err.code) || 500;
  const known = [400,401,403,404,409,422];
  const status = known.includes(code) ? code : 500;
  if (status === 500) console.error(req.traceId, err);
  res.status(status).json({
    error: err.name || 'server_error',
    message: status===500 ? undefined : err.message,
    traceId: req.traceId
  });
}