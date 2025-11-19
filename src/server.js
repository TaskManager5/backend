import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { Server as IOServer } from 'socket.io';
import swaggerUi from 'swagger-ui-express';

import { env, CORS_WHITELIST } from './config/env.js';
import { requestId, notFound, errorHandler } from './utils/errors.js';
import { openapi } from './docs/openapi.js';

// --- ИМПОРТЫ МАРШРУТОВ ---
import { router as users } from './routes/users.js';
import { router as auth } from './routes/auth.js';
import { router as teams } from './routes/teams.js';
import { router as tasks } from './routes/tasks.js';
import { router as analytics } from './routes/analytics.js';
// 1. ИМПОРТИРУЕМ НОВЫЙ МАРШРУТ
import { router as skills } from './routes/skills.js'; 

const app = express();

app.set('trust proxy', 1);
app.use(cors({
  origin(origin, cb){
    if (!origin || CORS_WHITELIST.includes(origin)) return cb(null, true);
    cb(new Error('CORS blocked'));
  },
  credentials: true
}));
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "connect-src": ["'self'", ...CORS_WHITELIST],
      "img-src": ["'self'", "data:"],
      "script-src": ["'self'"],
      "style-src": ["'self'", "'unsafe-inline'"]
    }
  }
}));
app.use(express.json());
app.use('/users', users); // <-- ОСТАВЛЯЕМ (мы его изменим в Шаге 4)
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(requestId);

const rlAuthLogin   = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders: true });
const rlAuthRefresh = rateLimit({ windowMs: 10*60*1000, max: 60, standardHeaders: true });
const rlGlobal      = rateLimit({ windowMs: 60*1000, max: 300, standardHeaders: true });

app.use('/auth/login', rlAuthLogin);
app.use('/auth/refresh', rlAuthRefresh);
app.use(rlGlobal);

app.use('/auth', auth);
app.use('/teams', teams);
app.use('/tasks', tasks);
app.use('/analytics', analytics);
// 2. РЕГИСТРИРУЕМ НОВЫЙ МАРШРУТ
app.use('/skills', skills);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

app.get('/healthz', (req,res)=>res.json({ ok:true }));

app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
const io = new IOServer(server, {
  cors: { origin: CORS_WHITELIST, credentials: true }
});
app.set('io', io);

server.listen(env.PORT, () => {
  console.log(`listening on http://localhost:${env.PORT}`);
});

process.on('SIGINT',  () => server.close(()=>process.exit(0)));
process.on('SIGTERM', () => server.close(()=>process.exit(0)));

export { app, server, io };