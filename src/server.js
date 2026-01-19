import express from "express";
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
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "https://grupo3b.vercel.app",
      "http://188.245.186.232",
      "http://188.245.186.232:4000",
      "http://localhost",
      "http://localhost:4000"
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS bloqueado: " + origin));
    }
  }
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

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Servidor backend funcionando" });
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);

  try {
    await connectDB();
    console.log("MongoDB conectado");
  } catch (err) {
    console.error("Error conectando MongoDB:", err);
  }
});
