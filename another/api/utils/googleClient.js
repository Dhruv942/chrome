const { google } = require('googleapis');
const User = require('../models/User');

async function getAuthenticatedClient(userId) {
  if (!userId) {
    const error = new Error('Unauthorized: No user cookie found.');
    error.status = 401;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error('Unauthorized: User not found.');
    error.status = 401;
    throw error;
  }
  if (!user.refreshToken) {
    const error = new Error('Authorization Expired: Please log in again.');
    error.status = 401;
    throw error;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
  });

  // Automatically save the new access token if it gets refreshed
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      console.log('✅ Access token was refreshed!');
      await User.findByIdAndUpdate(user._id, { accessToken: tokens.access_token });
      console.log('✅ New access token saved to the database.');
    }
  });
  
  return oauth2Client;
}

module.exports = { getAuthenticatedClient };