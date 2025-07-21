
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const { analyzeEmail } = require('../utils/geminiService');

// GET route for fetching unread emails for the Gmail tab
router.get('/', async (req, res) => {
  try {
    const oauth2Client = req.googleOAuth2Client;

    if (!oauth2Client) {
        console.error('gmailTabRoutes: googleOAuth2Client not found on request. Middleware might have failed.');
        return res.status(401).json({ status: 'not_logged_in', error: 'Google OAuth client not available. Re-authentication required.' });
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

   
    const messagesRes = await gmail.users.messages.list({ 
        userId: 'me', 
        maxResults: 20, 
        q: 'is:unread -in:spam -in:promotions -category:social -category:forums -from:newsletter -from:marketing -label:read -subject:"unsubscribe" -from:linkedin.com' 
        
    });
    const messages = messagesRes.data.messages || [];
    
    console.log(`Found ${messages.length} unread, filtered messages for processing in Gmail tab.`);

    if (messages.length === 0) {
      console.log('No unread messages found to process in Gmail tab.');
      return res.json([]);
    }

    const emailPromises = messages.map(async ({ id }) => {
      let basicEmailInfo;
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
          type: 'Gmail' // Initial type before AI analysis
        };

        const analysisResult = await analyzeEmail(basicEmailInfo);

        const combinedEmail = {
          ...basicEmailInfo,
          ...analysisResult, // Overwrite with AI analysis
          source: analysisResult.source || basicEmailInfo.type, // Use AI's source if available
          title: analysisResult.summary || basicEmailInfo.subject || '(No Subject)' // Use AI summary as title if available
        };

        // Gmail tab: Final filter based on AI's importance/urgency
        return (combinedEmail.isUrgent || combinedEmail.isImportant) ? combinedEmail : null;

      } catch (emailErr) {
        console.error(`Error processing or analyzing email ${id} in Gmail tab:`, emailErr.message);
        return null; // Return null to filter out errored emails
      }
    });

    const allProcessedEmails = (await Promise.all(emailPromises)).filter(Boolean);

   
    const filteredEmails = allProcessedEmails.filter(email => 
      email.isUrgent === true || email.isImportant === true
    );

    console.log(`Successfully processed and filtered ${filteredEmails.length} urgent/important emails for Gmail tab.`);
    res.json(filteredEmails);

  } catch (err) {
    console.error('Gmail Tab Error:', err.message);
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
         return res.status(401).json({ status: 'not_logged_in', error: 'Google API authentication failed. Please log in again.' });
    }
    res.status(err.status || 500).json({ error: 'Failed to fetch Gmail data.' });
  }
});

// NEW: POST route to mark an email as read
router.post('/mark-as-read', async (req, res) => {
  try {
    const oauth2Client = req.googleOAuth2Client;
    const { messageId } = req.body; // Expecting the Gmail message ID in the request body

    if (!oauth2Client) {
      console.error('mark-as-read: googleOAuth2Client not found. Middleware might have failed.');
      return res.status(401).json({ status: 'not_logged_in', error: 'Google OAuth client not available. Re-authentication required.' });
    }

    if (!messageId) {
      console.warn('mark-as-read: No messageId provided in request body.');
      return res.status(400).json({ error: 'Message ID is required to mark an email as read.' });
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    console.log(`Attempting to mark email ID: ${messageId} as read...`);

    // Modify the email to remove the 'UNREAD' label
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      resource: {
        removeLabelIds: ['UNREAD']
      }
    });

    console.log(`✅ Email ID: ${messageId} successfully marked as read.`);
    res.status(200).json({ message: 'Email marked as read successfully.' });

  } catch (err) {
    console.error(`❌ Error marking email as read (ID: ${req.body.messageId || 'N/A'}):`, err.message);
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
      return res.status(401).json({ status: 'not_logged_in', error: 'Google API authentication failed. Please log in again.' });
    }
    res.status(err.status || 500).json({ error: 'Failed to mark email as read.', details: err.message });
  }
});

// NEW: GET route to fetch full email content
router.get('/:messageId/full', async (req, res) => {
  try {
    const oauth2Client = req.googleOAuth2Client;
    const { messageId } = req.params;

    if (!oauth2Client) {
      console.error('getFullEmailContent: googleOAuth2Client not found.');
      return res.status(401).json({ status: 'not_logged_in', error: 'Google OAuth client not available. Re-authentication required.' });
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    console.log(`Fetching full content for email ID: ${messageId}`);
    const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });

    let emailBody = '';
    
    // Helper function to decode base64 data
    const decodeBase64 = (data) => {
        return Buffer.from(data, 'base64').toString('utf8');
    };

    // Recursive function to find the best content part (text/plain or text/html)
    const findContentPart = (parts) => {
        let textPlainContent = null;
        let textHtmlContent = null;

        for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                textPlainContent = decodeBase64(part.body.data);
            } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
                textHtmlContent = decodeBase64(part.body.data);
            } else if (part.parts) { // Recurse into multipart parts
                const nestedContent = findContentPart(part.parts);
                textPlainContent = textPlainContent || nestedContent.textPlainContent;
                textHtmlContent = textHtmlContent || nestedContent.textHtmlContent;
            }
        }
        return { textPlainContent, textHtmlContent };
    };

    if (msg.data.payload) {
        if (msg.data.payload.body && msg.data.payload.body.data) {
            // Direct body content (often for simpler emails)
            emailBody = decodeBase64(msg.data.payload.body.data);
        } else if (msg.data.payload.parts) {
            // Multipart email, find the best part
            const { textPlainContent, textHtmlContent } = findContentPart(msg.data.payload.parts);
            // Prefer plain text, fall back to HTML, or use snippet if all else fails
            emailBody = textPlainContent || textHtmlContent || msg.data.snippet || 'No full content available.';
        } else {
            // No direct body or parts, use snippet
            emailBody = msg.data.snippet || 'No full content available.';
        }
    } else {
        // No payload, use snippet
        emailBody = msg.data.snippet || 'No full content available.';
    }

    // Construct the direct Gmail link
    const gmailLink = `https://mail.google.com/mail/u/0/#inbox/${messageId}`;

    console.log(`✅ Full content fetched for email ID: ${messageId}`);
    res.json({ messageId, fullContent: emailBody, link: gmailLink });

  } catch (err) {
    console.error(`❌ Error fetching full email content for ID ${req.params.messageId}:`, err.message);
    if (err.response && (err.response.status === 401 || err.response.status === 403)) {
         return res.status(401).json({ status: 'not_logged_in', error: 'Google API authentication failed. Please log in again.' });
    }
    res.status(err.status || 500).json({ error: 'Failed to fetch full email content.', details: err.message });
  }
});
    
module.exports = router;