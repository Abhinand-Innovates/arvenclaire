const mongoose = require('mongoose');
const { Schema } = mongoose;

const walletTransactionSchema = new Schema({
  type: {
    type: String,
    enum: ['credit', 'debit'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true
  },
  orderId: {
    type: String,
    default: null
  },
  transactionId: {
    type: String,
    unique: true,
    default: function() {
      return 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }
  },
  balanceAfter: {
    type: Number,
    required: true
  }
}, { timestamps: true });

const walletSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  transactions: [walletTransactionSchema]
}, { timestamps: true });

// Method to add money to wallet
walletSchema.methods.addMoney = function(amount, description, orderId = null) {
  this.balance += amount;
  this.transactions.push({
    type: 'credit',
    amount: amount,
    description: description,
    orderId: orderId,
    balanceAfter: this.balance
  });
  return this.save();
};

// Method to deduct money from wallet
walletSchema.methods.deductMoney = function(amount, description, orderId = null) {
  if (this.balance < amount) {
    throw new Error('Insufficient wallet balance');
  }
  this.balance -= amount;
  this.transactions.push({
    type: 'debit',
    amount: amount,
    description: description,
    orderId: orderId,
    balanceAfter: this.balance
  });
  return this.save();
};

// Static method to get or create wallet for user
walletSchema.statics.getOrCreateWallet = async function(userId) {
  let wallet = await this.findOne({ userId });
  if (!wallet) {
    wallet = new this({ userId, balance: 0, transactions: [] });
    await wallet.save();
  }
  return wallet;
};

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;