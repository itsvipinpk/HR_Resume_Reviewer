import { Router } from "express";
import { retrievalController } from "../controllers/retrievalController";

const router = Router();

router.get("/search/readiness", retrievalController.getReadiness);
router.post("/embeddings", retrievalController.generateEmbedding);
router.post("/search/bm25", retrievalController.searchBM25);
router.post("/search/vector", retrievalController.searchVector);
router.post("/search/hybrid", retrievalController.searchHybrid);
router.post("/search/rerank", retrievalController.searchRerank);
router.post("/search/summarize", retrievalController.searchSummarize);
router.post("/search", retrievalController.search);

export default router;
