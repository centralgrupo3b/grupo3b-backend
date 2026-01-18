import express from "express";
import { createOrder, getOrders, getOrderById, approveOrder, rejectOrder, getSalesStats, getSalesDetail, updateOrder } from "../controllers/order.controller.js";
import { verifyToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.get("/", getOrders);
router.get("/stats/sales", getSalesStats);
router.get("/detail/sales", getSalesDetail);
router.get("/:orderId", verifyToken, getOrderById);
router.post("/", verifyToken, createOrder);

// Actions on orders (protected)
router.post("/:orderId/approve", verifyToken, approveOrder);
router.post("/:orderId/reject", verifyToken, rejectOrder);
router.put("/:orderId", verifyToken, updateOrder);

export default router;