"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const multerConfig_1 = require("../../../config/multerConfig");
const errorHandler_1 = require("../../../middleware/errorHandler");
const ingestionController_1 = require("../controllers/ingestionController");
const router = (0, express_1.Router)();
const batchUpload = multerConfig_1.upload.array("files", 10);
const uploadBatchFiles = (req, res, next) => {
    batchUpload(req, res, (error) => {
        if (error instanceof multer_1.default.MulterError &&
            error.code === "LIMIT_UNEXPECTED_FILE" &&
            error.field === "files") {
            next(new errorHandler_1.AppError(400, "BATCH_SIZE_EXCEEDED", "A batch cannot contain more than 10 resume PDFs"));
            return;
        }
        next(error);
    });
};
// Phase 3 — Module health route
router.get("/resume/health", ingestionController_1.ingestionController.getModuleHealth);
// Phase 4 — PDF upload route
router.post("/resume/upload", multerConfig_1.upload.single("file"), ingestionController_1.ingestionController.uploadResume);
// Phase 5 — PDF text extraction route
router.post("/resume/extract", multerConfig_1.upload.single("file"), ingestionController_1.ingestionController.extractResumeText);
// Phase 6 — Text cleaning route
router.post("/resume/clean", ingestionController_1.ingestionController.cleanResumeText);
// Phase 8 — Skills detection route
router.post("/resume/skills", ingestionController_1.ingestionController.detectResumeSkills);
// Phase 9 — Deterministic algorithm parsing route
router.post("/resume/parse", ingestionController_1.ingestionController.parseResume);
// Phase 10 — Optional LLM parsing route
router.post("/resume/llm-parse", ingestionController_1.ingestionController.llmParseResume);
// Phase 11 — Mistral resume embedding route
router.post("/resume/embed", ingestionController_1.ingestionController.embedResume);
// Phase 12 — Resume storage in MongoDB
router.post("/resume/store", ingestionController_1.ingestionController.storeResume);
router.get("/resume/:id", ingestionController_1.ingestionController.getResumeById);
router.post("/resume/search", ingestionController_1.ingestionController.searchResumes);
// Phase 13 — Complete end-to-end ingestion pipeline
router.post("/resume/inject", multerConfig_1.upload.single("file"), ingestionController_1.ingestionController.injectResume);
router.post("/resume/inject/batch", uploadBatchFiles, ingestionController_1.ingestionController.injectResumeBatch);
exports.default = router;
