import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  // Precio base (en la moneda usada en la orden, ARS) al momento de la venta
  // Esto permite calcular la ganancia histórica aunque cambie el precio luego
  basePriceAtSale: { type: Number, required: false },
  // item-level status: 'normal' (default) or 'devolucion' (returned)
  status: { type: String, enum: ['normal','devolucion'], default: 'normal' }
});

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // puede ser null si compras sin login
  branch: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", required: true },
  items: [orderItemSchema],
  total: Number,
  // order status can be 'pending', 'approved', 'rejected', plus 'devolucion' and 'modificado'
  status: { type: String, default: "pending", enum: ['pending','approved','rejected','devolucion','modificado'] },
  // payment method selected by customer
  paymentMethod: { type: String, enum: ['efectivo', 'débito', 'billetera virtual'], required: true },
  // delivery method: 'pickup' or 'delivery'
  deliveryMethod: { type: String, enum: ['pickup', 'delivery'], required: true },
  // delivery address (only required if deliveryMethod is 'delivery')
  deliveryAddress: {
    address: { type: String, required: false },
    city: { type: String, required: false },
    postalCode: { type: String, required: false }
  },
  // customer contact information
  customerName: { type: String, required: false },
  customerEmail: { type: String, required: false },
  customerPhone: { type: String, required: false },
  // notes for manual sales
  notes: { type: String, required: false },
}, { timestamps: true });

export default mongoose.model("Order", orderSchema);