import express from 'express';
import { getStockMovements, getStockReport } from '../controllers/stock.controller.js';
import { authenticate, isAdmin } from '../middleware/auth.middleware.js';

const router = express.Router();

// Historial de movimientos (admin)
router.get('/movements', authenticate, isAdmin, getStockMovements);

// Reporte de stock (admin)
router.get('/reports/stock', authenticate, isAdmin, getStockReport);

export default router;
