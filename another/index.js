
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
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

// --- START: CORS CONFIGURATION (with your ID hardcoded) ---

// This list defines which websites are allowed to make requests to your server.
const whitelist = [
  'chrome-extension://oigfiggbhldboidhbaggmfcnpkikpgmp', // Your specific Chrome Extension ID is added here.
  'http://localhost:3000' // Kept for local testing if needed.
];

console.log('CORS Whitelist:', whitelist); // This will show in your server logs
const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

// Public pages for OAuth Consent Screen
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/privacy-policy.html'));
});

app.get('/home', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/home.html'));
});

const corsOptions = {
  origin: function (origin, callback) {
    // The `!origin` check allows tools like Postman to work.
    if (whitelist.indexOf(origin) !== -1 || !origin) {
      callback(null, true); // Allow the request
    } else {
      console.error(`CORS ERROR: Request from origin "${origin}" was blocked.`);
      callback(new Error('This origin is not allowed by CORS')); // Block the request
    }
  },
  credentials: true, // This is essential for sending cookies (for login sessions).
};

// Use the CORS middleware with our options.
app.use(cors(corsOptions));

// --- END: CORS CONFIGURATION ---


// --- Standard Middleware ---
app.use(express.json()); // To parse JSON bodies
app.use(cookieParser()); // To parse cookies


// --- API Routes ---
// Auth routes do not need the refresh token middleware
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/auth/github', githubAuthRoutes);

// Tab routes are protected and need a valid token
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