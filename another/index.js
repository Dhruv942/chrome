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
app.use(express.json());
app.use(cookieParser());

// --- API Routes ---
// Auth routes
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/auth/github', githubAuthRoutes);

// Tab routes (with refresh token middleware where needed)
app.use('/api/tab/gmail', refreshTokenMiddleware, gmailTabRoutes);
app.use('/api/tab/linkedin', refreshTokenMiddleware, linkedinTabRoutes);
app.use('/api/tab/github', githubTabRoutes);
app.use('/api/tab/calendar', refreshTokenMiddleware, calendarTabRoutes);
app.use('/api/tab/recommendations', refreshTokenMiddleware, recommendationsTabRoutes);

// --- Server Startup ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
