import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // null for redeem
  type: { type: String, enum: ['give', 'redeem'], required: true },
  amount: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);