import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { RequestWithId } from "./requestId";

export class AppError extends Error {
  public statusCode: number;
  public errorCode: string;

  constructor(statusCode: number, errorCode: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  const reqWithId = req as RequestWithId;
  const requestId = reqWithId.requestId || "unknown";

  let statusCode = err.statusCode || (err.status ? Number(err.status) : 500);
  let errorCode = err.errorCode || "INTERNAL_SERVER_ERROR";
  let message = err.message || "An unexpected error occurred";

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      statusCode = 413;
      errorCode = "FILE_TOO_LARGE";
      message = "Resume exceeds maximum upload size";
    } else {
      statusCode = 400;
      errorCode = "FILE_UPLOAD_ERROR";
      message = err.message;
    }
  }

  console.error(
    JSON.stringify({
      requestId,
      errorCode,
      statusCode,
      message,
      stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    })
  );

  res.status(statusCode).json({
    success: false,
    requestId,
    errorCode,
    message,
  });
};
