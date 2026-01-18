import mongoose from 'mongoose';

const StockMovementSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  from: { type: String, enum: ['central', 'other'], default: 'central' },
  toBranch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: false },
  quantity: { type: Number, required: true },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('StockMovement', StockMovementSchema);
