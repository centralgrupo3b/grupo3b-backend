import express from "express";
import path from 'path';
import cors from "cors";
import dotenv from "dotenv";
import { connectDB } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import productRoutes from "./routes/product.routes.js";
import branchRoutes from "./routes/branch.routes.js";
import orderRoutes from "./routes/order.routes.js";
import stockRoutes from "./routes/stock.routes.js";
import brandRoutes from "./routes/brand.routes.js";
import typeRoutes from "./routes/type.routes.js";
import stockRequestRoutes from "./routes/stockrequest.routes.js";

dotenv.config();
const app = express();
app.use(cors({
  origin: "https://grupo3b.vercel.app"
}));
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/branches", branchRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/types", typeRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/stock-requests", stockRequestRoutes);


const PORT = process.env.PORT || 4000;

// Conectar a la base de datos
connectDB();


// Ruta de prueba
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Servidor backend de stock funcionando 🚀" });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});