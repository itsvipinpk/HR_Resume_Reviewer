import { Request, Response, NextFunction } from "express";
import { RequestWithId } from "./requestId";

export const loggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const reqWithId = req as RequestWithId;

  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const logData = {
      requestId: reqWithId.requestId || "unknown",
      method: req.method,
      endpoint: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
    };
    console.log(JSON.stringify(logData));
  });

  next();
};
