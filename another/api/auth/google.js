// AUTH ROUTE - Fixed version with name handling
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const path = require('path');
const User = require('../models/User');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "https://chrome-hb9p.onrender.com/";

const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile', // Add this to get name
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
];

// Helper function to generate a fallback name
function generateFallbackName(email, googleData) {
    // Try different sources for name
    if (googleData.name && googleData.name.trim()) {
        return googleData.name.trim();
    }
    
    if (googleData.given_name || googleData.family_name) {
        const firstName = googleData.given_name || '';
        const lastName = googleData.family_name || '';
        return `${firstName} ${lastName}`.trim();
    }
    
    // If no name available, use email prefix
    if (email) {
        const emailPrefix = email.split('@')[0];
        // Clean up email prefix (remove dots, numbers, etc.)
        const cleanName = emailPrefix
            .replace(/[._\-\d]/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
        return cleanName || `User ${emailPrefix}`;
    }
    
    // Last resort
    return `User ${Date.now()}`;
}

router.get('/', async (req, res) => {
    console.log('--- Auth Route Hit ---');
    
    try {
        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
        const { code } = req.query;

        if (!code) {
            console.log('No code found. Generating Auth URL...');
            const url = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: SCOPES, // Updated scopes to include profile
                prompt: 'consent',
                include_granted_scopes: true
            });
            console.log('Redirecting to Google for login with updated scopes.');
            return res.redirect(url);
        }

        console.log('✅ Received code from Google:', code.substring(0, 20) + '...');
        console.log('Attempting to get tokens...');
        
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        console.log('✅ Got tokens successfully.');

        if (!tokens.access_token) {
            throw new Error("Failed to retrieve access token from Google.");
        }

        console.log('Attempting to get user info...');
        const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
        const { data } = await oauth2.userinfo.get();
        console.log('✅ Raw user data from Google:', data);

        // CRITICAL: Handle missing or empty name
        if (!data.email) {
            throw new Error("No email received from Google. Email is required.");
        }

        // Generate a proper name using fallback logic
        const userName = generateFallbackName(data.email, data);
        console.log('✅ Generated user name:', userName);

        // Check if user already exists
        let existingUser = await User.findByGoogleId(data.id);
        
        const updateData = {
            googleId: data.id,
            name: userName, // Using our generated name
            email: data.email,
            googleAccessToken: tokens.access_token,
            scopes: tokens.scope ? tokens.scope.split(' ') : SCOPES,
            googleAccessTokenExpiry: new Date(tokens.expiry_date),
            isActive: true,
            lastAuthenticatedAt: new Date()
        };

        // Handle additional user profile data if available
        if (data.picture) {
            updateData.profilePicture = data.picture;
        }
        if (data.locale) {
            updateData.locale = data.locale;
        }

        // Handle refresh token logic
        if (tokens.refresh_token) {
            updateData.googleRefreshToken = tokens.refresh_token;
            updateData.refreshTokenSource = 'new';
            console.log('✅ New refresh token received and will be saved.');
        } else if (existingUser && existingUser.googleRefreshToken) {
            updateData.googleRefreshToken = existingUser.googleRefreshToken;
            updateData.refreshTokenSource = 'existing';
            console.log('ℹ️ No new refresh token received. Keeping existing refresh token.');
        } else {
            console.warn('⚠️ No refresh token available! User may need frequent re-authentication.');
            updateData.refreshTokenSource = 'none';
        }

        console.log('Attempting to save/update user in DB...');
        console.log('Update data:', {
            ...updateData,
            googleAccessToken: '***HIDDEN***',
            googleRefreshToken: updateData.googleRefreshToken ? '***EXISTS***' : 'NONE'
        });

        const user = await User.findOneAndUpdate(
            { googleId: data.id },
            { $set: updateData },
            { 
                upsert: true, 
                new: true, 
                setDefaultsOnInsert: true,
                runValidators: true // Ensure validation runs
            }
        );

        // Update login information
        await user.updateLoginInfo();

        console.log('✅ User saved/updated successfully! User ID:', user._id);
        console.log('User details:', {
            name: user.name,
            email: user.email,
            loginCount: user.loginCount,
            refreshTokenSource: user.refreshTokenSource
        });
        
        // Set cookie
 res.cookie('user_id', user._id, {
    httpOnly: true,
    // On Render, NODE_ENV is 'production', so this will correctly be `true`
    secure: process.env.NODE_ENV === 'production', 
    // This is the critical change that allows the cookie to be sent from the extension
    sameSite: 'none', 
    maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
});

        // Send success response
        const successHtml = `
      <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Post Login - NotifAI</title>
  <style>
    body {
      margin: 0;
      font-family: sans-serif;
      background-color: #f9fafb;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      animation: fadeIn 0.5s ease-in;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .container {
      background-color: white;
      padding: 2rem;
      border-radius: 1rem;
      box-shadow: 0 10px 20px rgba(0,0,0,0.1);
      max-width: 500px;
      width: 100%;
      border: 1px solid #e5e7eb;
      text-align: center;
    }

    .check-icon {
      width: 64px;
      height: 64px;
      color: #10b981;
      margin-bottom: 1.5rem;
    }

    .title {
      font-size: 1.875rem;
      font-weight: bold;
      color: #111827;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      color: #6b7280;
      margin-bottom: 2rem;
    }

    .steps h2 {
      font-size: 1.125rem;
      font-weight: 600;
      color: #111827;
      margin-bottom: 1rem;
    }

    .steps ol {
      list-style: decimal inside;
      color: #6b7280;
      padding-left: 0;
    }

    .steps li {
      margin-bottom: 1.5rem;
    }

    .steps strong {
      color: #111827;
      display: block;
      margin-bottom: 0.25rem;
    }

    .gif-box {
      border: 1px solid #d1d5db;
      border-radius: 0.5rem;
      background-color: #f9fafb;
      padding: 1rem;
      overflow: hidden;
      margin-top: 0.75rem;
      box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);
    }

    .button {
      margin-top: 2rem;
      width: 100%;
      padding: 0.75rem;
      background-color: #3b82f6;
      color: white;
      font-size: 1.125rem;
      border: none;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.3s ease;
    }

    .button:hover {
      background-color: #2563eb;
    }

    .footer {
      text-align: center;
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 2rem;
    }
  </style>
</head>
<body>

  <div class="container">
    <!-- Check Icon -->
    <svg class="check-icon" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>

    <h1 class="title">You're all set!</h1>
    <p class="subtitle">You have successfully logged in. Let's get you started with NotifAI.</p>
    <div style="margin-bottom: 1.5rem;">
  <img src="${user.picture}" alt="Profile Picture" style="width: 64px; height: 64px; border-radius: 50%; margin-bottom: 0.5rem;" />
  <div style="color: #111827; font-weight: 600;">${user.name}</div>
  <div style="color: #6b7280;">${user.email}</div>
</div>

    <div class="steps">
      <h2>How to Use the Extension</h2>
      <ol>
        <li>
          <strong>Pin the Extension for Easy Access</strong>
          <p>Click the puzzle icon (🧩) in your toolbar, then find NotifAI and click the pin icon.</p>
          <div class="gif-box">
            <svg viewBox="0 0 240 120" width="100%" height="auto">
              <!-- Browser bar -->
              <rect x="5" y="5" width="230" height="30" rx="4" fill="#E5E7EB" />
              <circle cx="17" cy="20" r="4" fill="#F87171" />
              <circle cx="29" cy="20" r="4" fill="#FBBF24" />
              <circle cx="41" cy="20" r="4" fill="#34D399" />

              <!-- Puzzle Icon -->
              <g transform="translate(175 12)">
                <path d="M14 7l-2.5 2.5a1 1 0 000 1.414L14 13.414V14a2 2 0 01-2 2h-1.586l-2.5 2.5a1 1 0 01-1.414 0L4 16v-1.586l-2.5-2.5a1 1 0 010-1.414L4 8V7a2 2 0 012-2h1.586l2.5-2.5a1 1 0 011.414 0L14 5v2z" fill="#4B5563"/>
              </g>

              <!-- Dropdown -->
              <rect x="80" y="40" width="150" height="50" rx="4" fill="white" stroke="#D1D5DB" />
              <text x="90" y="60" font-family="sans-serif" font-size="12" fill="#1F2937" font-weight="500">NotifAI</text>
              <text x="90" y="75" font-family="sans-serif" font-size="10" fill="#6B7280">Your focus, amplified.</text>

              <!-- Pin Icon -->
              <path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" fill="#3B82F6" transform="translate(168 58) scale(1.2)" />
            </svg>
          </div>
        </li>
        <li>
          <strong>Open NotifAI to View Notifications</strong>
          <p>Once pinned, click the NotifAI icon (🔔) in your toolbar at any time.</p>
        </li>
      </ol>
    </div>

    <button class="button" onclick="alert('Continue clicked!')">Start Using NotifAI</button>
  </div>

  <div class="footer">
    &copy; <span id="year"></span> NotifAI. Your focus, amplified.
  </div>

  <script>
    document.getElementById('year').textContent = new Date().getFullYear();
  </script>
</body>
</html>

        `;
        
        res.send(successHtml);

    } catch (error) {
        console.error('❌❌❌ AUTHENTICATION FAILED ❌❌❌');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        
        // Handle specific validation errors
        if (error.name === 'ValidationError') {
            console.error('Validation Error Details:', error.errors);
            Object.keys(error.errors).forEach(key => {
                console.error(`  - ${key}: ${error.errors[key].message}`);
            });
        }
        
        if (error.response) {
            console.error('Error Response Data:', error.response.data);
        }
        console.error('Error Stack:', error.stack);
        
        const errorHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authentication Failed</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .error { color: #f44336; background: #ffebee; padding: 15px; border-radius: 5px; }
                .retry { background: #2196F3; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-top: 10px; }
            </style>
        </head>
        <body>
            <div class="error">
                <h1>❌ Authentication Failed</h1>
                <p><strong>Error:</strong> ${error.message}</p>
                ${error.name === 'ValidationError' ? '<p>There was an issue with the user data validation.</p>' : ''}
            </div>
            <a href="/api/auth/google" class="retry">Try Again</a>
        </body>
        </html>
        `;
        
        res.status(500).send(errorHtml);
    }
});

module.exports = router;