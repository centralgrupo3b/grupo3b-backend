import mongoose from "mongoose";

const stockRequestSchema = new mongoose.Schema({
  // The branch admin requesting stock
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // The branch requesting stock
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  // Array of items requested with product ID and quantity
  items: [
    {
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      quantity: {
        type: Number,
        required: true,
        min: 1
      }
    }
  ],
  // Status: 'pending', 'approved', 'rejected', 'fulfilled'
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'delivered_unpaid', 'fulfilled'],
    default: 'pending'
  },
  // Notes from central admin (approval reason, rejection reason, etc)
  notes: { type: String, default: '' },
  // Central admin who processed the request
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Date the request was processed
  processedAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model("StockRequest", stockRequestSchema);
