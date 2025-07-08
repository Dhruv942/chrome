require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');
const connectDB = require('./api/utils/mongo');

const refreshTokenMiddleware = require('./api/middlewares/refreshTokenMiddleware');

// --- Import Routes ---
const googleAuthRoutes = require('./api/auth/google');
const githubAuthRoutes = require('./api/auth/github');
const gmailTabRoutes = require('./api/tabs/gmail');
const linkedinTabRoutes = require('./api/tabs/linkedin');
const githubTabRoutes = require('./api/tabs/github');
const calendarTabRoutes = require('./api/tabs/calendar');
const recommendationsTabRoutes = require('./api/tabs/recommendations');

// --- Initialize App and DB Connection ---
const app = express();
connectDB();

// --- Public Pages ---
app.use(express.static(path.join(__dirname, 'public')));
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/privacy-policy.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

// --- CORS Configuration ---
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow tools like Postman

    // ✅ Allow any Chrome extension temporarily
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // ✅ Allow local development
    if (origin === 'http://localhost:3000') {
      return callback(null, true);
    }

    // ❌ Block everything else
    console.error(`❌ CORS BLOCKED: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// --- Standard Middleware ---
app.use(express.json({ limit: '10mb' })); // Increased limit for larger GitHub data
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// --- Request Timeout Middleware ---
app.use((req, res, next) => {
  // Set timeout for GitHub API calls (they can take longer due to multiple requests)
  req.setTimeout(30000); // 30 seconds
  res.setTimeout(30000);
  next();
});

// --- Rate Limiting Middleware (Optional but recommended) ---
// To enable rate limiting, install: npm install express-rate-limit
// const rateLimit = require('express-rate-limit');
// const githubRateLimit = rateLimit({
//   windowMs: 15 * 60 * 1000, // 15 minutes
//   max: 100, // Limit each IP to 100 requests per windowMs for GitHub routes
//   message: 'Too many GitHub API requests, please try again later.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// --- API Routes ---
// Auth routes
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/auth/github', githubAuthRoutes);

// Tab routes (with refresh token middleware where needed)
app.use('/api/tab/gmail', refreshTokenMiddleware, gmailTabRoutes);
app.use('/api/tab/linkedin', refreshTokenMiddleware, linkedinTabRoutes);
app.use('/api/tab/github', githubTabRoutes); // Rate limiting can be added later if needed
app.use('/api/tab/calendar', refreshTokenMiddleware, calendarTabRoutes);
app.use('/api/tab/recommendations', refreshTokenMiddleware, recommendationsTabRoutes);

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  
  // Handle timeout errors
  if (err.code === 'TIMEOUT') {
    return res.status(408).json({ error: 'Request timeout' });
  }
  
  // Handle rate limit errors
  if (err.status === 429) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  
  // Generic error handler
  res.status(500).json({ error: 'Internal server error' });
});

// --- 404 Handler ---
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// --- Server Startup ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 GitHub API integration: Enhanced with PR and comment support`);
});