const express = require('express');
const router = express.Router();
const { google } = require('googleapis');


router.get('/', async (req, res) => {
    try {
      
        const oauth2Client = req.googleOAuth2Client;
        
        if (!oauth2Client) {
            console.error('calendarTabRoutes: googleOAuth2Client not found on request. Middleware might have failed.');
            return res.status(401).json({ status: 'not_logged_in', error: 'Google OAuth client not available. Re-authentication required.' });
        }

        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        
        const now = new Date();
        const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const eventsRes = await calendar.events.list({
            calendarId: 'primary',
            timeMin: now.toISOString(),
            timeMax: nextWeek.toISOString(),
            maxResults: 15,
            singleEvents: true,
            orderBy: 'startTime',
        });

        const events = eventsRes.data.items || [];
        
        const formattedEvents = events.map(event => ({
            id: event.id,
            title: event.summary,
            start: event.start.dateTime || event.start.date,
            link: event.htmlLink,
            timestamp: event.start.dateTime || event.start.date,
            isUrgent: new Date(event.start.dateTime || event.start.date) < new Date(now.getTime() + 24 * 60 * 60 * 1000), // Urgent if within 24 hours
            isImportant: true, // All calendar events are considered important
            summary: `Upcoming event: ${event.summary} at ${new Date(event.start.dateTime || event.start.date).toLocaleTimeString()}`
        }));

        res.json(formattedEvents);

    } catch (err) {
        console.error('Calendar Tab Error:', err.message);
        
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
             return res.status(401).json({ status: 'not_logged_in', error: 'Google API authentication failed. Please log in again.' });
        }
        res.status(err.status || 500).json({ error: err.message });
    }
});

module.exports = router;