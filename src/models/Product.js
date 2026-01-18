import mongoose from "mongoose";

const productSchema = new mongoose.Schema({
  sku: { type: String, unique: true, required: true }, // Código identificador
  name: { type: String, required: true },
  brand: String,
  category: String,
  description: String,
  price: { type: Number, required: true }, // Precio base del catálogo
  centralQuantity: { type: Number, default: 0 }, // Stock central
  image: String, // URL de imagen principal (Cloudinary u otro)
  imagePublicId: String, // Cloudinary public_id (opcional, para gestión)
  // Precios personalizados por sucursal (admin_sucursal puede cambiar esto)
  branchPrices: [
    {
      branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
      price: { type: Number },
      // Incremento configurado por la sucursal (porcentaje), opcional
      markup: { type: Number }
    }
  ]
}, { timestamps: true });

export default mongoose.model("Product", productSchema);