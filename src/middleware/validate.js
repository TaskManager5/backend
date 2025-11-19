export const validate = {
  body: (schema)=>(req,res,next)=>{
    const r = schema.safeParse(req.body);
    if (!r.success) return res.status(400).json(toZod(r.error));
    req.body = r.data; next();
  },
  query: (schema)=>(req,res,next)=>{
    const r = schema.safeParse(req.query);
    if (!r.success) return res.status(400).json(toZod(r.error));
    req.query = r.data; next();
  },
  params: (schema)=>(req,res,next)=>{
    const r = schema.safeParse(req.params);
    if (!r.success) return res.status(400).json(toZod(r.error));
    req.params = r.data; next();
  }
};

function toZod(err){
  return {
    error:'validation_error',
    fields: err.issues.map(i=>({ path:i.path.join('.'), code:i.code, message:i.message }))
  };
}
