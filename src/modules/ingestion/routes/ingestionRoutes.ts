import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { upload } from "../../../config/multerConfig";
import { AppError } from "../../../middleware/errorHandler";
import { ingestionController } from "../controllers/ingestionController";

const router = Router();
const batchUpload = upload.array("files", 10);
const uploadBatchFiles = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  batchUpload(req, res, (error: unknown) => {
    if (
      error instanceof multer.MulterError &&
      error.code === "LIMIT_UNEXPECTED_FILE" &&
      error.field === "files"
    ) {
      next(
        new AppError(
          400,
          "BATCH_SIZE_EXCEEDED",
          "A batch cannot contain more than 10 resume PDFs"
        )
      );
      return;
    }
    next(error);
  });
};

// Phase 3 — Module health route
router.get("/resume/health", ingestionController.getModuleHealth);

// Phase 4 — PDF upload route
router.post("/resume/upload", upload.single("file"), ingestionController.uploadResume);

// Phase 5 — PDF text extraction route
router.post("/resume/extract", upload.single("file"), ingestionController.extractResumeText);

// Phase 6 — Text cleaning route
router.post("/resume/clean", ingestionController.cleanResumeText);

// Phase 8 — Skills detection route
router.post("/resume/skills", ingestionController.detectResumeSkills);

// Phase 9 — Deterministic algorithm parsing route
router.post("/resume/parse", ingestionController.parseResume);

// Phase 10 — Optional LLM parsing route
router.post("/resume/llm-parse", ingestionController.llmParseResume);

// Phase 11 — Mistral resume embedding route
router.post("/resume/embed", ingestionController.embedResume);

// Phase 12 — Resume storage in MongoDB
router.post("/resume/store", ingestionController.storeResume);
router.get("/resume/:id", ingestionController.getResumeById);
router.post("/resume/search", ingestionController.searchResumes);

// Phase 13 — Complete end-to-end ingestion pipeline
router.post("/resume/inject", upload.single("file"), ingestionController.injectResume);
router.post(
  "/resume/inject/batch",
  uploadBatchFiles,
  ingestionController.injectResumeBatch
);

export default router;
