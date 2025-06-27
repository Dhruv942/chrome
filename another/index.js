// api/index.js
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('../api/utils/mongo');
const refreshTokenMiddleware = require('../api/middlewares/refreshTokenMiddleware');

const googleAuthRoutes = require('../api/auth/google');
const githubAuthRoutes = require('../api/auth/github'); 

const gmailTabRoutes = require('../api/tabs/gmail');
const linkedinTabRoutes = require('../api/tabs/linkedin'); 
const githubTabRoutes = require('../api/tabs/github');
const calendarTabRoutes = require('../api/tabs/calendar');
const recommendationsTabRoutes = require('../api/tabs/recommendations');

// 👇 key part for vercel compatibility
const app = express();

connectDB();

app.use(cookieParser());
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.static('public'));

app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/auth', githubAuthRoutes); 
app.use('/api/tab/gmail', refreshTokenMiddleware, gmailTabRoutes);
app.use('/api/tab/linkedin', refreshTokenMiddleware, linkedinTabRoutes); 
app.use('/api/tab/github', githubTabRoutes);     
app.use('/api/tab/calendar', refreshTokenMiddleware, calendarTabRoutes);
app.use('/api/tab/recommendations', refreshTokenMiddleware, recommendationsTabRoutes);

app.get('/', (req, res) => {
  res.send('✅ Backend API is live on Vercel!');
});

// 👇 this is required in Vercel
module.exports = app;
