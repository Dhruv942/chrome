
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');

const { analyzeEmail } = require('../utils/geminiService'); // Make sure this path is correct

router.get('/', async (req, res) => {
  try {
   
    const oauth2Client = req.googleOAuth2Client; 

    if (!oauth2Client) {
        console.error('linkedinTabRoutes: googleOAuth2Client not found on request. Middleware might have failed.');
        return res.status(401).json({ status: 'not_logged_in', error: 'Google OAuth client not available. Re-authentication required.' });
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Assuming you want to filter emails from linkedin.com
    const messagesRes = await gmail.users.messages.list({ userId: 'me', maxResults: 20, q: 'from:linkedin.com' });
    const messages = messagesRes.data.messages || [];
    
    if (messages.length === 0) {
        console.log('No messages from linkedin.com found.');
        return res.json([]);
    }

    const emailPromises = messages.map(async ({ id }) => {
        let basicEmailInfo; // Declare outside try-catch
        try {
            const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
            const headers = msg.data.payload.headers;
            const subject = headers.find(h => h.name === 'Subject')?.value || '';
            const from = headers.find(h => h.name === 'From')?.value || '';
            const date = headers.find(h => h.name === 'Date')?.value || '';
            const snippet = msg.data.snippet || '';

            basicEmailInfo = {
                id,
                subject,
                from,
                date,
                snippet,
                timestamp: msg.internalDate,
                type: 'Gmail' // Original source is Gmail
            };

            const analysis = await analyzeEmail(basicEmailInfo);

            return { 
                ...basicEmailInfo,
                ...analysis, // This will contain summary, category, isUrgent, isImportant
                source: 'Gmail', // Explicitly set source to Gmail
                type: 'Gmail-LinkedInFilter' // More specific type if needed
            };
        } catch (emailErr) {
            console.error(`Error processing LinkedIn-filtered Gmail message ID ${id}:`, emailErr.message);
            return {
                ...(basicEmailInfo || { id: id, subject: '(Error)', from: 'Error Processing', snippet: '(Error)' }),
                source: 'Gmail',
                category: 'AI Error',
                isUrgent: false,
                isImportant: false,
                summary: 'Could not process this LinkedIn-related email.',
                error: `Failed to process: ${emailErr.message}`
            };
        }
    });

    const processedEmails = (await Promise.all(emailPromises)).filter(Boolean); // Filter out nulls
    res.json(processedEmails);

  } catch (err) {
    console.error('LinkedIn Tab Error:', err.message);
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
         return res.status(401).json({ status: 'not_logged_in', error: 'Google API authentication failed. Please log in again.' });
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;