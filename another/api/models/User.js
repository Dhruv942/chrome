// models/User.js - Updated schema with optional name
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  // Google Authentication Fields
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    required: false
  },
  googleAccessToken: { type: String },
  googleRefreshToken: { type: String },
  googleAccessTokenExpiry: { type: Date },
  refreshTokenSource: { 
    type: String, 
    enum: ['new', 'existing', 'refreshed', 'none'],
    default: 'none'
  },
  lastAuthenticatedAt: { type: Date },
  refreshTokenInvalidatedAt: { type: Date },
  
  // GitHub Authentication Fields
  githubId: {
    type: String,
    unique: true,
    sparse: true,
    required: false
  },
  githubAccessToken: { type: String },
  
  // General User Information
  name: { 
    type: String, 
    required: false, // ✅ CHANGED: Made optional
    default: function() {
      // Auto-generate name from email if not provided
      if (this.email) {
        const emailPrefix = this.email.split('@')[0];
        return emailPrefix.replace(/[._\-\d]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim() || `User ${emailPrefix}`;
      }
      return `User ${Date.now()}`;
    }
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  
  // Additional profile fields
  profilePicture: { type: String }, // Google profile picture
  locale: { type: String }, // User's locale from Google
  
  scopes: [{ type: String }],
  
  // Login Tracking
  lastLogin: { type: Date, default: Date.now },
  loginCount: { type: Number, default: 0 },
  
  // Token Status Tracking
  tokenRefreshCount: { type: Number, default: 0 },
  lastTokenRefresh: { type: Date },
  consecutiveRefreshFailures: { type: Number, default: 0 },
  lastRefreshFailure: { type: Date },
  
  // User Status
  isActive: { type: Boolean, default: true },
  
  // Whitelist Rules
  whitelistRules: [{
    source: { type: String, enum: ['Gmail', 'GitHub', 'Calendar'], required: true },
    type: {
      type: String,
      enum: ['sender', 'subject', 'body', 'repository', 'organization', 'eventType'],
      required: true
    },
    value: { type: String, required: true },
    isUrgent: { type: Boolean, default: false },
    isImportant: { type: Boolean, default: false },
    category: { type: String, default: 'Whitelisted Item' },
    createdAt: { type: Date, default: Date.now },
  }],
  
}, {
  timestamps: true
});

// Indexes
UserSchema.index({ googleId: 1 });
UserSchema.index({ githubId: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ lastLogin: -1 });
UserSchema.index({ googleAccessTokenExpiry: 1 });

// Pre-save middleware to ensure name is always set
UserSchema.pre('save', function(next) {
  // Ensure name is always available
  if (!this.name || this.name.trim() === '') {
    if (this.email) {
      const emailPrefix = this.email.split('@')[0];
      this.name = emailPrefix.replace(/[._\-\d]/g, ' ')
                            .replace(/\b\w/g, l => l.toUpperCase())
                            .trim() || `User ${emailPrefix}`;
    } else {
      this.name = `User ${Date.now()}`;
    }
  }
  
  // Other pre-save logic...
  if (this.isModified('googleAccessToken') && this.googleAccessToken) {
    if (!this.lastAuthenticatedAt) {
      this.lastAuthenticatedAt = new Date();
    }
  }
  
  if (this.isModified('googleRefreshToken') && !this.googleRefreshToken) {
    this.refreshTokenSource = 'none';
  }
  
  next();
});

// All your existing methods remain the same...
UserSchema.methods.updateLoginInfo = function() {
  this.lastLogin = new Date();
  this.loginCount += 1;
  this.lastAuthenticatedAt = new Date();
  this.consecutiveRefreshFailures = 0;
  return this.save();
};

UserSchema.methods.updateTokenRefreshInfo = function() {
  this.lastTokenRefresh = new Date();
  this.tokenRefreshCount += 1;
  this.consecutiveRefreshFailures = 0;
  return this.save();
};

UserSchema.methods.isTokenExpired = function() {
  if (!this.googleAccessTokenExpiry) return true;
  const now = new Date();
  return (now.getTime() + 5 * 60 * 1000) >= this.googleAccessTokenExpiry.getTime();
};

UserSchema.methods.hasValidRefreshToken = function() {
  return !!(this.googleRefreshToken && 
           this.refreshTokenSource !== 'none' && 
           this.consecutiveRefreshFailures < 3);
};

UserSchema.methods.getDisplayName = function() {
  return this.name || this.email.split('@')[0] || 'Unknown User';
};

// Static methods
UserSchema.statics.findByGoogleId = function(googleId) {
  return this.findOne({ googleId });
};

UserSchema.statics.findByGithubId = function(githubId) {
  return this.findOne({ githubId });
};

UserSchema.statics.getActiveUsers = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.models.User || mongoose.model('User', UserSchema);