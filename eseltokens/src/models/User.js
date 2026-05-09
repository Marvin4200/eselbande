import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  discriminator: { type: String },
  avatar: { type: String },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['member', 'admin'], default: 'member' },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.User || mongoose.model('User', UserSchema);