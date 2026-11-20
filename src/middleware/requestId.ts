import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";

export interface RequestWithId extends Request {
  requestId?: string;
}

export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const incomingId = req.headers["x-request-id"] as string | undefined;
  const requestId = incomingId || uuidv4();

  (req as RequestWithId).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};
