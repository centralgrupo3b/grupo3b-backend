import express from "express";
import multer from 'multer';
import { verifyToken } from '../middleware/auth.middleware.js';
import { requireRole, requireCentralAdmin } from '../middleware/authorization.middleware.js';
import { 
  createProduct, 
  getProducts, 
  getProductsByBranch,
  getMostSoldProducts,
  updateCentralStock, 
  updateProduct, 
  deleteProduct,
  updateBranchProductPrice,
  deleteBranchProductPrice,
  recalculateBranchPrices
} from "../controllers/product.controller.js"; 

const router = express.Router();

// configurar almacenamiento de archivos en memoria (no escribir a disco)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Public route - anyone can list all products (catalog)
router.get("/", getProducts);
// Most sold products (auth required to limit branch access)
router.get("/most-sold", verifyToken, getMostSoldProducts);

// Branch-specific products route (shows catalog with branch stock and prices)
router.get("/:branchId/branch", verifyToken, getProductsByBranch);

// Protected routes - require authentication
router.post("/", verifyToken, requireRole(['admin_central']), upload.single('image'), createProduct); // Solo admin_central crea productos
router.put("/:productId/stock", verifyToken, requireCentralAdmin, updateCentralStock); // Solo admin_central actualiza stock central
router.put("/:productId", verifyToken, requireRole(['admin_central']), upload.single('image'), updateProduct); // Solo admin_central edita
router.delete("/:productId", verifyToken, requireRole(['admin_central']), deleteProduct); // Solo admin_central borra

// Branch admin modifies prices for their products
router.put("/:productId/branch-price/:branchId", verifyToken, updateBranchProductPrice); // admin_sucursal modifica precios
router.delete("/:productId/branch-price/:branchId", verifyToken, deleteBranchProductPrice); // admin_sucursal restaura precio

// Recalcular todos los precios de una sucursal según una nueva tasa de cambio (body: { rate, force })
router.put("/branch-prices/recalculate/:branchId", verifyToken, recalculateBranchPrices); // admin_sucursal recalcula precios

export default router;