


// api/auth/github.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User'); // Correct path to your User model

// GitHub OAuth configuration (LOAD FROM .ENV)
const GITHUB_CLIENT_ID = ""
const GITHUB_CLIENT_SECRET = ""
const GITHUB_REDIRECT_URI = ""


// --- Step 1: Redirect to GitHub for Authorization ---
router.get('/github', (req, res) => {
    // Optionally, you can store the current user_id from cookie in state parameter
    // if you need to reliably link back to an existing session after redirect.
    // For simplicity here, we'll just rely on the cookie persisting.
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${GITHUB_REDIRECT_URI}&scope=repo%20notifications%20read:user%20user:email`;
    res.redirect(githubAuthUrl);
});

// --- Step 2: GitHub Callback after User Authorization ---
router.get('/github/callback', async (req, res) => {
    const { code } = req.query;
    const userIdFromCookie = req.cookies.user_id; // Check for existing user ID from cookie

    if (!code) {
        console.error('GitHub OAuth: No code received.');
        return res.status(400).send('GitHub OAuth failed: No code received.');
    }

    try {
        // Exchange code for access token
        const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: GITHUB_REDIRECT_URI
        }, {
            headers: {
                Accept: 'application/json' // Request JSON response
            }
        });

        const githubAccessToken = tokenResponse.data.access_token;

        if (!githubAccessToken) {
            console.error('GitHub OAuth: No access token received.', tokenResponse.data);
            return res.status(500).send('GitHub OAuth failed: Could not get access token.');
        }

        // Fetch GitHub user profile using the access token
        const githubUserResponse = await axios.get('https://api.github.com/user', {
            headers: {
                Authorization: `Bearer ${githubAccessToken}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        const githubProfile = githubUserResponse.data; // Contains id, login, name, email

        let user;
        let isNewSession = false; // Flag to determine if we need to set a new cookie

        if (userIdFromCookie) {
            // Scenario A: User is potentially already logged in via Google (or another method)
            user = await User.findById(userIdFromCookie);

            if (user) {
                // Check if this GitHub account is already linked to another user
                const existingGithubUserByGithubId = await User.findOne({ githubId: githubProfile.id });

                if (existingGithubUserByGithubId && existingGithubUserByGithubId._id.toString() !== user._id.toString()) {
                    // This GitHub account is already linked to a DIFFERENT user
                    console.warn(`GitHub account ${githubProfile.login} (ID: ${githubProfile.id}) is already linked to another user (DB ID: ${existingGithubUserByGithubId._id}). Cannot link to current user (DB ID: ${user._id}).`);
                    return res.status(409).send('This GitHub account is already linked to another user. Please log in with that account or unlink GitHub first.');
                }

                // Link GitHub account to the existing user
                user.githubId = githubProfile.id;
                user.githubAccessToken = githubAccessToken;
                // Optionally update name/email if they are empty
                if (!user.name) user.name = githubProfile.name || githubProfile.login;
                if (!user.email) user.email = githubProfile.email; // GitHub email might be private/null
                await user.save();
                console.log(`GitHub account linked to existing user: ${user._id}`);
            } else {
                // User ID in cookie is invalid or user not found. Treat as a new session attempt.
                console.warn('User ID from cookie not found in DB. Proceeding with GitHub-first login.');
                isNewSession = true; // Will create or find user based on GitHub ID below
            }
        } else {
            // Scenario B: No active user_id cookie, so this is a GitHub-first login attempt
            isNewSession = true;
        }

        if (isNewSession) {
            // Try to find user by GitHub ID
            user = await User.findOne({ githubId: githubProfile.id });

            if (!user) {
                // No user found with this GitHub ID, create a new one
                user = new User({
                    githubId: githubProfile.id,
                    name: githubProfile.name || githubProfile.login, // Use name or login as default name
                    email: githubProfile.email, // Can be null from GitHub
                    githubAccessToken: githubAccessToken,
                    // No googleId, accessToken, refreshToken fields for GitHub-only user
                });
                console.log(`New user created from GitHub: ${user._id}`);
            } else {
                // User found by GitHub ID, update their token
                user.githubAccessToken = githubAccessToken;
                // Optionally update name/email if they are null
                if (!user.name) user.name = githubProfile.name || githubProfile.login;
                if (!user.email) user.email = githubProfile.email;
                console.log(`Existing GitHub user logged in: ${user._id}`);
            }
            await user.save();

            // Set the user_id cookie for the newly created/found GitHub user session
            res.cookie('user_id', user._id.toString(), {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'Lax',
            });
        }

        // Send success page response
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>GitHub Login Success</title>
                <style>
                    body { font-family: sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f0f2f5; color: #333; }
                    .card { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.1); text-align: center; }
                    h1 { color: #28a745; margin-bottom: 15px; }
                    p { margin-bottom: 25px; }
                    button { background-color: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; font-size: 1em; }
                    button:hover { background-color: #0056b3; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>GitHub Account Linked!</h1>
                    <p>You can now close this tab and reload your Chrome Extension.</p>
                    <button onclick="window.close()">Close Tab</button>
                </div>
            </body>
            </html>
        `);

    } catch (err) {
        console.error('GitHub OAuth Callback Error:', err.response?.data || err.message);
        res.status(500).send('GitHub OAuth failed. Please try again.');
    }
});

module.exports = router;