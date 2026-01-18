import mongoose from "mongoose";
import bcrypt from "bcrypt";

const userSchema = new mongoose.Schema({
  fullname: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  username: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  // Role: 'user', 'admin_sucursal', 'admin_central'
  role: { 
    type: String, 
    enum: ['user', 'admin_sucursal', 'admin_central'], 
    default: 'user' 
  },
  // branchId: required if role is 'admin_sucursal', null if 'admin_central' or 'user'
  branchId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Branch', 
    default: null 
  },
  // Legacy field for compatibility, maps to role
  isAdmin: { type: Boolean, default: false },
}, { timestamps: true });

userSchema.pre("save", async function(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

export default mongoose.model("User", userSchema);