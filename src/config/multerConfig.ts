import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { ENV } from "./env";
import { AppError } from "../middleware/errorHandler";

const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    const safeName = `${uuidv4()}-${Date.now()}${ext}`;
    cb(null, safeName);
  },
});

const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const isPdfMime = file.mimetype === "application/pdf";
  const isPdfExt = path.extname(file.originalname).toLowerCase() === ".pdf";

  if (isPdfMime || isPdfExt) {
    cb(null, true);
  } else {
    cb(new AppError(415, "INVALID_FILE_TYPE", "Only PDF files are allowed"));
  }
};

export const upload = multer({
  storage,
  limits: {
    fileSize: ENV.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
  fileFilter,
});
