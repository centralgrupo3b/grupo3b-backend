import express from "express";
import { createBranch, getBranches, getBranchById, updateBranch, deleteBranch, transferStock, updateBranchStockManual, updateBranchExchangeRate, updateBranchProductPrices, getBranchProductPrices } from "../controllers/branch.controller.js";
import { authenticate, isAdmin } from "../middleware/auth.middleware.js";
import { requireBranchAccess } from "../middleware/authorization.middleware.js";

const router = express.Router();

//rutas públicas
router.post("/", createBranch);
router.get("/", getBranches);
router.get("/:id", getBranchById);

//rutas admin
router.put(
  "/:id",
  authenticate,
  isAdmin,
  updateBranch
);

router.delete(
  "/:id",
  authenticate,
  isAdmin,
  deleteBranch
);

router.post(
  "/transfer",
  authenticate,
  isAdmin,
  transferStock
);

router.post(
  "/update-stock-manual",
  authenticate,
  requireBranchAccess,
  updateBranchStockManual
);

router.put(
  "/:id/exchange-rate",
  authenticate,
  requireBranchAccess,
  updateBranchExchangeRate
);

router.put(
  "/:id/product-prices",
  authenticate,
  requireBranchAccess,
  updateBranchProductPrices
);

router.get(
  "/:id/product-prices",
  authenticate,
  requireBranchAccess,
  getBranchProductPrices
);

export default router;