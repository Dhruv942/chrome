// server.js
require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const connectDB = require('./api/utils/mongo'); 

const refreshTokenMiddleware = require('./api/middlewares/refreshTokenMiddleware');


connectDB();


const googleAuthRoutes = require('./api/auth/google');
const githubAuthRoutes = require('./api/auth/github'); 

const gmailTabRoutes = require('./api/tabs/gmail');
const linkedinTabRoutes = require('./api/tabs/linkedin'); 
const githubTabRoutes = require('./api/tabs/github');
const calendarTabRoutes = require('./api/tabs/calendar');
const recommendationsTabRoutes = require('./api/tabs/recommendations');

const app = express();


app.use(cookieParser());
app.use(cors({
  origin: 'http://localhost:3000', 
  credentials: true
}));



app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/auth', githubAuthRoutes); 

app.use('/api/tab/gmail', refreshTokenMiddleware, gmailTabRoutes);
app.use('/api/tab/linkedin', refreshTokenMiddleware, linkedinTabRoutes); 
app.use('/api/tab/github', githubTabRoutes);     
app.use('/api/tab/calendar', refreshTokenMiddleware, calendarTabRoutes);
app.use('/api/tab/recommendations', refreshTokenMiddleware, recommendationsTabRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
console.log('Loaded PORT:', process.env.PORT);