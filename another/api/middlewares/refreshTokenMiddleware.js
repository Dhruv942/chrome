// AUTH ROUTE - Improved version
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const path = require('path');
const User = require('../models/User');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google";

const SCOPES = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
];

router.get('/', async (req, res) => {
    console.log('--- Auth Route Hit ---');
    
    try {
        const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);
        const { code } = req.query;

        if (!code) {
            console.log('No code found. Generating Auth URL...');
            const url = oauth2Client.generateAuthUrl({
                access_type: 'offline', // CRITICAL: This ensures refresh token
                scope: SCOPES,
                prompt: 'consent', // CRITICAL: Forces consent screen to get refresh token
                include_granted_scopes: true // Include previously granted scopes
            });
            console.log('Redirecting to Google for login with new scopes.');
            return res.redirect(url);
        }

        console.log('✅ Received code from Google:', code.substring(0, 20) + '...');
        console.log('Attempting to get tokens...');
        
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        console.log('✅ Got tokens successfully.');
        console.log('Tokens received:', {
            access_token: tokens.access_token ? 'YES' : 'NO',
            refresh_token: tokens.refresh_token ? 'YES' : 'NO',
            expiry_date: tokens.expiry_date
        });

        if (!tokens.access_token) {
            throw new Error("Failed to retrieve access token from Google.");
        }

        // CRITICAL CHECK: If no refresh token received
        if (!tokens.refresh_token) {
            console.warn('⚠️ NO REFRESH TOKEN RECEIVED! This may cause re-authentication issues.');
            // Option 1: Force re-consent to get refresh token
            if (!req.query.force_consent) {
                console.log('Forcing consent to get refresh token...');
                const forceConsentUrl = oauth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                    prompt: 'consent',
                    include_granted_scopes: true,
                    state: 'force_consent=true' // Custom state to track this
                });
                return res.redirect(forceConsentUrl);
            }
        }

        console.log('Attempting to get user info...');
        const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
        const { data } = await oauth2.userinfo.get();
        console.log('✅ Got user info from Google:', data);

        // Check if user already exists
        let existingUser = await User.findByGoogleId(data.id);
        
        const updateData = {
            googleId: data.id,
            name: data.name,
            email: data.email,
            googleAccessToken: tokens.access_token,
            scopes: tokens.scope ? tokens.scope.split(' ') : SCOPES,
            googleAccessTokenExpiry: new Date(tokens.expiry_date),
            isActive: true,
            lastAuthenticatedAt: new Date() // Track when user last authenticated
        };

        // IMPROVED: Handle refresh token with fallback
        if (tokens.refresh_token) {
            updateData.googleRefreshToken = tokens.refresh_token;
            updateData.refreshTokenSource = 'new'; // Track source
            console.log('✅ New refresh token received and will be saved.');
        } else if (existingUser && existingUser.googleRefreshToken) {
            updateData.googleRefreshToken = existingUser.googleRefreshToken;
            updateData.refreshTokenSource = 'existing'; // Track source
            console.log('ℹ️ No new refresh token received. Keeping existing refresh token.');
        } else {
            console.error('❌ CRITICAL: No refresh token available! User will need frequent re-authentication.');
            updateData.refreshTokenSource = 'none';
            // You might want to redirect back to force consent here
        }

        console.log('Attempting to save/update user in DB...');
        const user = await User.findOneAndUpdate(
            { googleId: data.id },
            { $set: updateData },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Update login information using the new method
        await user.updateLoginInfo();

        console.log('✅ User saved/updated successfully! User ID:', user._id);
        console.log('User login count:', user.loginCount);
        console.log('Refresh token source:', updateData.refreshTokenSource);
        
        // IMPROVED: Set longer-lasting cookie
        console.log('Setting cookie with user ID:', user._id);
        res.cookie('user_id', user._id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 90 * 24 * 60 * 60 * 1000 // Extended to 90 days instead of 30
        });

        console.log('Redirecting to success page.');
        
        // Send success response with refresh token status
        const successHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Authentication Successful</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                .success { color: #4CAF50; }
                .warning { color: #ff9800; background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; }
                .info { color: #2196F3; }
            </style>
        </head>
        <body>
            <h1 class="success">✅ Authentication Successful!</h1>
            <p class="info">Welcome, ${data.name}!</p>
            <p class="info">Login Count: ${user.loginCount}</p>
            <p class="info">Refresh Token Status: ${updateData.refreshTokenSource}</p>
            ${updateData.refreshTokenSource === 'none' ? 
                '<div class="warning">⚠️ Warning: No refresh token available. You may need to re-authenticate more frequently.</div>' : 
                '<p class="success">✅ Refresh token available - seamless experience enabled!</p>'
            }
            <script>
                setTimeout(() => {
                    window.close();
                }, 3000);
            </script>
        </body>
        </html>
        `;
        
        res.send(successHtml);

    } catch (error) {
        console.error('❌❌❌ AUTHENTICATION FAILED ❌❌❌');
        console.error('Error Name:', error.name);
        console.error('Error Message:', error.message);
        if (error.response) {
            console.error('Error Data:', error.response.data);
        }
        console.error('Error Stack:', error.stack);
        res.status(500).send(`
            <h1>Authentication Failed</h1>
            <p>Error: ${error.message}</p>
            <p><a href="/api/auth/google">Try Again</a></p>
        `);
    }
});

module.exports = router;

// MIDDLEWARE - Improved version with better fallback handling
const refreshTokenMiddleware = async (req, res, next) => {
    const userId = req.cookies.user_id;

    if (!userId) {
        console.log('refreshTokenMiddleware: No user_id cookie found.');
        return res.status(401).json({ 
            status: 'not_logged_in', 
            error: 'Authentication required. No user ID found.',
            redirect_url: '/api/auth/google' 
        });
    }

    try {
        console.log(`refreshTokenMiddleware: Processing request for user ID: ${userId}`);
        const user = await User.findById(userId);

        if (!user || !user.isActive) {
            console.log(`refreshTokenMiddleware: User with ID ${userId} not found or inactive in DB.`);
            res.clearCookie('user_id');
            return res.status(401).json({ 
                status: 'not_logged_in', 
                error: 'User not found, inactive, or session expired. Please log in again.',
                redirect_url: '/api/auth/google'
            });
        }
        
        if (!user.googleAccessToken) {
            console.log(`refreshTokenMiddleware: User ${userId} has no Google access token.`);
            return res.status(401).json({ 
                status: 'not_logged_in', 
                error: 'Google authentication not completed for this user. Please log in again.',
                redirect_url: '/api/auth/google'
            });
        }
        
        console.log('refreshTokenMiddleware: User found. GoogleAccessToken exists.');
        console.log('User Google Refresh Token exists:', !!user.googleRefreshToken); 
        console.log('User Google Access Token Expiry:', user.googleAccessTokenExpiry);
        console.log('Refresh Token Source:', user.refreshTokenSource);

        const oauth2Client = new google.auth.OAuth2(
            GOOGLE_CLIENT_ID,
            GOOGLE_CLIENT_SECRET,
            REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: user.googleAccessToken,
            refresh_token: user.googleRefreshToken,
        });
        
        console.log('refreshTokenMiddleware: OAuth2Client credentials set.');

        // Use the new method to check token expiry
        const isExpired = user.isTokenExpired();
        
        console.log('refreshTokenMiddleware: Current time:', new Date().toISOString());
        console.log('refreshTokenMiddleware: Token expiry time:', user.googleAccessTokenExpiry ? user.googleAccessTokenExpiry.toISOString() : 'null');
        console.log('refreshTokenMiddleware: Token expired check result:', isExpired);

        if (isExpired) {
            console.log(`refreshTokenMiddleware: Google access token for user ${userId} expired. Attempting refresh...`);

            if (!user.googleRefreshToken) {
                console.warn(`refreshTokenMiddleware: No Google refresh token for user ${userId}. Re-authentication required.`);
                
                // IMPROVED: Check if user recently authenticated
                const lastAuth = user.lastAuthenticatedAt || user.createdAt;
                const daysSinceAuth = (new Date() - lastAuth) / (1000 * 60 * 60 * 24);
                
                if (daysSinceAuth > 7) { // If more than 7 days since last auth
                    console.log('User last authenticated more than 7 days ago. Clearing session.');
                    res.clearCookie('user_id');
                }
                
                return res.status(401).json({ 
                    status: 'not_logged_in', 
                    error: 'Google access token expired and no refresh token available. Please log in again.',
                    redirect_url: '/api/auth/google',
                    days_since_auth: Math.floor(daysSinceAuth)
                });
            }

            try {
                console.log('refreshTokenMiddleware: Calling refreshAccessToken()...');
                const { credentials } = await oauth2Client.refreshAccessToken();
                console.log(`refreshTokenMiddleware: Google Token refreshed successfully for user ${userId}.`);
                
                // Update user with new credentials
                const updateData = {
                    googleAccessToken: credentials.access_token,
                    googleAccessTokenExpiry: new Date(credentials.expiry_date),
                    lastTokenRefresh: new Date()
                };
                
                if (credentials.refresh_token) {
                    updateData.googleRefreshToken = credentials.refresh_token;
                    updateData.refreshTokenSource = 'refreshed';
                    console.log('refreshTokenMiddleware: New refresh token received and saved.');
                }
                
                await User.findByIdAndUpdate(userId, { $set: updateData });
                
                // Update token refresh info using new method
                await user.updateTokenRefreshInfo();
                
                console.log('refreshTokenMiddleware: User document updated with new Google tokens.');
                console.log('Token refresh count:', user.tokenRefreshCount);

                oauth2Client.setCredentials(credentials);
                console.log('refreshTokenMiddleware: OAuth2Client updated with new credentials.');

            } catch (refreshError) {
                console.error(`refreshTokenMiddleware: Failed to refresh Google token for user ${userId}:`, refreshError.message);
                
                // IMPROVED: Handle specific refresh errors
                if (refreshError.message.includes('invalid_grant') || 
                    refreshError.message.includes('refresh_token') ||
                    refreshError.code === 400) {
                    console.error('Refresh token is invalid or expired. User needs to re-authenticate.');
                    
                    // Clear the invalid refresh token
                    await User.findByIdAndUpdate(userId, { 
                        $unset: { 
                            googleRefreshToken: 1,
                            refreshTokenSource: 1 
                        },
                        $set: {
                            refreshTokenInvalidatedAt: new Date()
                        }
                    });
                }
                
                res.clearCookie('user_id');
                
                return res.status(401).json({ 
                    status: 'not_logged_in', 
                    error: 'Failed to refresh Google access token. Please log in again.',
                    redirect_url: '/api/auth/google',
                    error_type: refreshError.message.includes('invalid_grant') ? 'invalid_refresh_token' : 'refresh_failed'
                });
            }
        } else {
            console.log(`refreshTokenMiddleware: Google access token for user ${userId} is still valid. Skipping refresh.`);
        }

        req.googleOAuth2Client = oauth2Client;
        req.user = user;
        
        console.log('refreshTokenMiddleware: Google OAuth2 client attached to request. Proceeding to next middleware.');
        next();

    } catch (error) {
        console.error('refreshTokenMiddleware: UNEXPECTED ERROR IN TOP-LEVEL CATCH:', error); 
        
        res.clearCookie('user_id');
        
        res.status(500).json({ 
            error: 'Internal server error during token verification.',
            redirect_url: '/api/auth/google'
        });
    }
};

module.exports = refreshTokenMiddleware;