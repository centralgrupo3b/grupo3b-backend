import express from 'express';
import { verifyToken } from '../middleware/auth.middleware.js';
import {
  createStockRequest,
  getStockRequests,
  getStockRequest,
  approveStockRequest,
  rejectStockRequest,
  fulfillStockRequest,
  markDeliveredUnpaid,
  markRequestFulfilled
} from '../controllers/stockrequest.controller.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Create a new stock request (branch admin)
router.post('/', createStockRequest);

// Get stock requests (central admin sees all, branch admin sees own)
router.get('/', getStockRequests);

// Get a specific stock request
router.get('/:id', getStockRequest);

// Approve a stock request (central admin only)
router.put('/:id/approve', approveStockRequest);

// Reject a stock request (central admin only)
router.put('/:id/reject', rejectStockRequest);

// Fulfill a stock request (transfer stock) (central admin only)
router.put('/:id/fulfill', fulfillStockRequest);

// Mark as delivered but unpaid (central admin only)
router.put('/:id/delivered-unpaid', markDeliveredUnpaid);

// Mark as fulfilled after delivered_unpaid (central admin only)
router.put('/:id/mark-fulfilled', markRequestFulfilled);

export default router;
