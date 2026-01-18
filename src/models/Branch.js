import mongoose from "mongoose";

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true },
  number: { type: String, required: true }, // Número de contacto/teléfono
  address: String,
  city: String,
  province: String,
  phone: String,
  
  // Branch admin (user responsible for this branch)
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Tasa de conversión USD -> ARS específica de la sucursal
  exchangeRate: { type: Number, default: 1 },

  // Cada sucursal tendrá su propio stock para cada producto
  stock: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      quantity: { type: Number, default: 0 },
      reservedQuantity: { type: Number, default: 0 } // usado en ventas
    }
  ],

  // Precios específicos por producto para esta sucursal
  productPrices: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
      profitMargin: { type: Number, default: 0 }, // Porcentaje de ganancia (ej: 20 para 20%)
      finalPrice: { type: Number, default: 0 } // Precio final en ARS incluyendo ganancia
    }
  ],

  // Markup por defecto para nuevos productos en esta sucursal
  defaultMarkup: { type: Number, default: 20 }
  
}, { timestamps: true });

export default mongoose.model("Branch", branchSchema);