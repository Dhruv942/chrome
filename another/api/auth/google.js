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
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
        });

        // Send success response
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
                .user-info { background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 10px 0; }
            </style>
        </head>
        <body>
            <h1 class="success">✅ Authentication Successful!</h1>
            <div class="user-info">
                <p><strong>Welcome:</strong> ${user.name}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Login Count:</strong> ${user.loginCount}</p>
                <p><strong>Refresh Token:</strong> ${user.refreshTokenSource}</p>
            </div>
            ${user.refreshTokenSource === 'none' ? 
                '<div class="warning">⚠️ Warning: No refresh token available. You may need to re-authenticate more frequently.</div>' : 
                '<p class="success">✅ Refresh token available - seamless experience enabled!</p>'
            }
            <script>
                setTimeout(() => {
                    window.close();
                }, 5000);
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