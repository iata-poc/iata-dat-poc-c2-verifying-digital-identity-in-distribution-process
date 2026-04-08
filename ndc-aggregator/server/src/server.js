import express from 'express';
import cors from 'cors';
import path from 'path';

import { config } from './config.js';
import { AppError } from './appError.js';
import { verificationPublicRouter } from './routes/verificationRoutes.js';
import ndcRouter from './routes/ndcRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import { credentialRouter } from './routes/credentialRoutes.js';

const errorhandler = (error, req, res, _next) => {
  console.error(`Error during the rest route(${req.url}): ${error.message}`, {
    stackTrace: error.stack,
    error,
  });

  let errorObject = error;
  if (!(error instanceof AppError)) {
    errorObject = new AppError({ msg: error.message });
  }
  res.status(errorObject.getStatusCode()).json(errorObject);
};

export const startServer = (globalDir) => {
  const app = express();
  app.use(
    cors({
      origin: config.web.allowedOrigins,
      optionsSuccessStatus: 200,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(express.static(path.join(globalDir, 'public')));

  // Agency login
  app.use('/api/auth', authRouter);

  // Digital identity verification (QR login, polling, callback)
  app.use('/api/public', verificationPublicRouter);

  // Credential management (revoke / enable)
  app.use('/api/credentials', credentialRouter);

  // NDC Agency Desktop routes
  app.use('/api', ndcRouter);

  // SPA fallback
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(globalDir, 'public', 'index.html'));
  });
  app.use(errorhandler);

  app.listen({ port: config.web.httpPort }, () => {
    console.log(`🚀 NDC Aggregator ready at port:${config.web.httpPort}`);
  });
};
