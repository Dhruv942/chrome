// api/tabs/recommendations.js
const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const axios = require('axios');
const { analyzeEmail } = require('../utils/geminiService'); 
const User = require('../models/User'); 

/**
 * Helper function to check if an item is within the last 2 days
 * @param {string|Date} timestamp - The timestamp to check
 * @returns {boolean} True if the item is within the last 2 days
 */
function isWithinLast2Days(timestamp) {
    if (!timestamp) return false;
    
    const itemDate = new Date(timestamp);
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000)); // 2 days ago
    
    return itemDate >= twoDaysAgo && itemDate <= now;
}

/**
 * applyWhitelistRulesToItem:
 * This function modifies the item properties based on matching whitelist rules.
 * It also determines if an item should be *explicitly filtered out* by a rule.
 *
 * @param {Object} item - The item to process (email, GitHub notification, calendar event).
 * @param {Array} rules - The array of whitelist rules from the user's profile.
 * @returns {Object} An object containing:
 *   - shouldKeep: boolean (true if the item should be kept based on AI/original importance OR a whitelist rule)
 *   - isFilteredOutByRule: boolean (true if a specific whitelist rule explicitly marks this item for removal)
 */
function applyWhitelistRulesToItem(item, rules) {
    let shouldKeep = false; 
    let isFilteredOutByRule = false; 

    if (item.isImportant || item.isUrgent) {
        shouldKeep = true;
    }

    for (const rule of rules) {
        let ruleMatched = false;

        if (!item.source || rule.source.toLowerCase() !== item.source.toLowerCase()) {
            continue;
        }

        switch (rule.source) {
            case 'Gmail':
            case 'JobPortal':   
            case 'SocialMedia': 
            case 'Newsletter':  
                if (rule.type === 'sender' && item.from && item.from.toLowerCase().includes(rule.value.toLowerCase())) {
                    ruleMatched = true;
                } else if (rule.type === 'subject' && item.title && item.title.toLowerCase().includes(rule.value.toLowerCase())) {
                    ruleMatched = true;
                } else if (rule.type === 'body' && item.snippet && item.snippet.toLowerCase().includes(rule.value.toLowerCase())) {
                    ruleMatched = true;
                }
                break;
            case 'GitHub':
                if (rule.type === 'repository' && item.summary && item.summary.toLowerCase().includes(rule.value.toLowerCase())) {
                    ruleMatched = true;
                } else if (rule.type === 'subject' && item.title && item.title.toLowerCase().includes(rule.value.toLowerCase())) {
                    ruleMatched = true;
                }
                break;
            case 'Calendar':
                if (rule.type === 'subject' && item.title && item.title.toLowerCase().includes(rule.value.toLowerCase())) {
                    ruleMatched = true;
                } else if (rule.type === 'eventType' && item.summary && item.summary.toLowerCase().includes(rule.value.toLowerCase())) {
                    ruleMatched = true;
                }
                break;
        }

        if (ruleMatched) {
            item.isUrgent = item.isUrgent || rule.isUrgent;
            item.isImportant = item.isImportant || rule.isImportant;
            item.category = rule.category; 

            if (!rule.isUrgent && !rule.isImportant && (rule.category.toLowerCase().includes('spam') || rule.category.toLowerCase().includes('promotion'))) {
                 isFilteredOutByRule = true; 
            } else {
                 shouldKeep = true; 
            }
        }
    }
    return { shouldKeep, isFilteredOutByRule }; 
}


/**
 * fetchAndProcessEmails: Fetches emails from the last 2 days from Gmail, analyzes them with Gemini,
 * and applies user-defined whitelist rules.
 * @param {google.auth.OAuth2} oauth2Client - The authenticated Google OAuth2 client.
 * @param {Array} whitelistRules - The user's whitelist rules.
 * @returns {Promise<Array>} A promise that resolves to an array of processed and filtered email items.
 */
async function fetchAndProcessEmails(oauth2Client, whitelistRules) {
    if (!oauth2Client) {
        console.error('fetchAndProcessEmails: oauth2Client is null or undefined. Skipping Gmail fetch.');
        return []; 
    }

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    
    // Calculate date for last 2 days
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const dateFilter = Math.floor(twoDaysAgo.getTime() / 1000); // Gmail uses Unix timestamp
    
    try {
        const messagesRes = await gmail.users.messages.list({ 
            userId: 'me', 
            maxResults: 50, // Increased to ensure we get enough from last 2 days
            q: `after:${dateFilter} -in:spam -in:promotions -category:social -category:forums -from:newsletter -from:marketing -label:read -subject:"unsubscribe"` 
        });
        const messages = messagesRes.data.messages || [];
        
        if (messages.length === 0) {
            console.log('No Gmail messages found from the last 2 days matching filters.');
            return [];
        }
        console.log(`Found ${messages.length} Gmail messages from last 2 days for processing.`);

        const emailPromises = messages.map(async ({ id }) => {
            let basicEmailInfo; 
            try {
                const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'metadata', metadataHeaders: ['Subject', 'From', 'Date'] });
                const headers = msg.data.payload.headers;
                const subject = headers.find(h => h.name === 'Subject')?.value || '';
                const from = headers.find(h => h.name === 'From')?.value || '';
                const date = headers.find(h => h.name === 'Date')?.value || '';
                const snippet = msg.data.snippet; 
                
                // Convert Gmail internal date to proper timestamp
                const emailTimestamp = new Date(parseInt(msg.data.internalDate));
                
                // Double-check if email is within last 2 days
                if (!isWithinLast2Days(emailTimestamp)) {
                    return null; // Skip emails older than 2 days
                }
                
                basicEmailInfo = { 
                    id,
                    subject,
                    from,
                    date,
                    snippet,
                    timestamp: emailTimestamp.toISOString(),
                    type: 'Gmail' 
                };

                let analysis = await analyzeEmail(basicEmailInfo); 

                const emailItem = {
                    ...basicEmailInfo, 
                    ...analysis, 
                    source: analysis.source || basicEmailInfo.type, 
                    title: analysis.summary || basicEmailInfo.subject || '(No Subject)', 
                };
                
                const { shouldKeep, isFilteredOutByRule } = applyWhitelistRulesToItem(emailItem, whitelistRules);

                if (isFilteredOutByRule) {
                    return null; 
                }
                
                return (emailItem.isUrgent || emailItem.isImportant) ? emailItem : null;

            } catch (emailErr) {
                console.error(`Error processing single Gmail message ID ${id}:`, emailErr.message);
                return {
                     ...(basicEmailInfo || { id: id, title: '(Error Processing)', from: 'Error', snippet: '(Error)' }),
                     source: 'Error',
                     category: 'Processing Failed',
                     isUrgent: false,
                     isImportant: false,
                     summary: 'Could not process this email item.',
                     error: emailErr.message
                };
            }
        });

        return (await Promise.all(emailPromises)).filter(Boolean);
    } catch (error) {
        console.error('Error fetching Gmail messages for recommendations:', error.message);
        return [];
    }
}

/**
 * fetchGithubNotifications: Fetches GitHub notifications from the last 2 days and applies whitelist rules.
 * NOTE: This uses the user's GitHub access token, so `oauth2Client` is not needed here.
 * @param {Object} user - The user object containing githubAccessToken.
 * @param {Array} whitelistRules - The user's whitelist rules.
 * @returns {Promise<Array>} A promise that resolves to an array of processed GitHub items.
 */
async function fetchGithubNotifications(user, whitelistRules) {
    if (!user || !user.githubAccessToken) {
        console.log('Skipping GitHub fetch: User or GitHub access token missing.');
        return [];
    }
    
    // Calculate date for last 2 days
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const since = twoDaysAgo.toISOString();
    
    try {
        const response = await axios.get('https://api.github.com/notifications', { 
            headers: { Authorization: `Bearer ${user.githubAccessToken}` },
            params: { since: since, all: false } // Only unread notifications since 2 days ago
        });
        
        return response.data
            .filter(n => isWithinLast2Days(n.updated_at)) // Double-check date filter
            .map(n => {
                const githubItem = {
                    id: n.id,
                    title: n.subject.title || '(No Title)',
                    source: 'GitHub',
                    summary: `Repo: ${n.repository.full_name} (${n.subject.type}). Reason: ${n.reason}`,
                    isUrgent: false, 
                    isImportant: true, 
                    timestamp: n.updated_at,
                };
                const { shouldKeep, isFilteredOutByRule } = applyWhitelistRulesToItem(githubItem, whitelistRules);
                return isFilteredOutByRule ? null : (shouldKeep ? githubItem : null);
            })
            .filter(Boolean); 
    } catch (error) {
        console.error('Error fetching GitHub notifications:', error.message);
        return [];
    }
}

/**
 * fetchCalendarEvents: Fetches Google Calendar events from the last 2 days and applies whitelist rules.
 * @param {google.auth.OAuth2} oauth2Client - The authenticated Google OAuth2 client.
 * @param {Array} whitelistRules - The user's whitelist rules.
 * @returns {Promise<Array>} A promise that resolves to an array of processed calendar items.
 */
async function fetchCalendarEvents(oauth2Client, whitelistRules) {
    if (!oauth2Client) {
        console.error('fetchCalendarEvents: oauth2Client is null or undefined. Skipping Calendar fetch.');
        return [];
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000)); // 2 days ago

    try {
        const eventsRes = await calendar.events.list({
            calendarId: 'primary',
            timeMin: twoDaysAgo.toISOString(), // Changed from 'now' to 'twoDaysAgo'
            timeMax: now.toISOString(), // Changed from 'nextWeek' to 'now'
            maxResults: 30, // Increased limit
            singleEvents: true,
            orderBy: 'startTime',
        });
        
        return (eventsRes.data.items || [])
            .filter(event => {
                const eventStart = new Date(event.start.dateTime || event.start.date);
                return isWithinLast2Days(eventStart); // Double-check date filter
            })
            .map(event => {
                const eventStart = new Date(event.start.dateTime || event.start.date);
                const calendarItem = {
                    id: event.id,
                    title: event.summary || '(No Event Title)',
                    source: 'Calendar',
                    summary: `Event at ${eventStart.toLocaleString()}` + (event.location ? ` - ${event.location}` : ''),
                    isUrgent: false, // Changed logic since we're looking at past events
                    isImportant: true, 
                    timestamp: eventStart.toISOString(),
                };
                const { shouldKeep, isFilteredOutByRule } = applyWhitelistRulesToItem(calendarItem, whitelistRules);
                return isFilteredOutByRule ? null : (shouldKeep ? calendarItem : null);
            })
            .filter(Boolean); 
    } catch (error) {
        console.error('Error fetching Calendar events:', error.message);
        return [];
    }
}


// --- Main Recommendation Tab Route ---
router.get('/', async (req, res) => {
    try {
        const userId = req.cookies.user_id;
        if (!userId) {
            console.log('Recommendations Tab: No user_id cookie found.');
            return res.status(401).json({ status: 'not_logged_in', error: 'User not authenticated. Please log in.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.log('Recommendations Tab: User not found in DB for ID:', userId);
            return res.status(404).json({ error: 'User not found.' });
        }

        const oauth2Client = req.googleOAuth2Client;

        if (!oauth2Client) {
            console.error('Recommendations Tab: req.googleOAuth2Client is missing. Middleware might not have run or failed unexpectedly.');
            return res.status(401).json({ status: 'not_logged_in', error: 'Google authentication client not available. Please log in again.' });
        }

        const whitelistRules = user.whitelistRules || [];

        console.log('Fetching recommendations for the last 2 days...');
        
        const [emails, github, calendar] = await Promise.all([
            fetchAndProcessEmails(oauth2Client, whitelistRules), 
            fetchGithubNotifications(user, whitelistRules),       
            fetchCalendarEvents(oauth2Client, whitelistRules),   
        ]);

        let allItems = [...emails, ...github, ...calendar];
        
        // Final filter to ensure all items are within last 2 days
        allItems = allItems.filter(item => isWithinLast2Days(item.timestamp));
        
        allItems.sort((a, b) => {
            if (a.isUrgent && !b.isUrgent) return -1;
            if (!a.isUrgent && b.isUrgent) return 1;

            if (a.isImportant && !b.isImportant) return -1;
            if (!a.isImportant && b.isImportant) return 1;

            const dateA = new Date(a.timestamp);
            const dateB = new Date(b.timestamp);

            if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
            if (isNaN(dateA.getTime())) return 1; 
            if (isNaN(dateB.getTime())) return -1; 
            
            return dateB.getTime() - dateA.getTime(); // Most recent first
        });

        console.log(`Returning ${allItems.length} items from the last 2 days`);
        res.json(allItems);

    } catch (err) {
        console.error('Recommendation Tab Error:', err.message);
        if (err.response && (err.response.status === 401 || err.response.status === 403)) {
            return res.status(401).json({ status: 'not_logged_in', error: 'Google API authentication failed. Please log in again.' });
        }
        res.status(err.status || 500).json({ error: err.message || 'Failed to fetch recommendations.' });
    }
});

// --- Whitelist Management Routes ---

router.post('/manage-whitelist', async (req, res) => {
    try {
        const userId = req.cookies.user_id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }

        const { source, type, value, isUrgent = false, isImportant = false, category = 'Whitelisted Item' } = req.body;

        if (!source || !type || !value) {
            return res.status(400).json({ error: 'Source, type, and value are required for the whitelist rule.' });
        }

        const allowedSources = ['Gmail', 'GitHub', 'Calendar']; 
        const allowedTypes = {
            Gmail: ['sender', 'subject', 'body'],
            GitHub: ['repository', 'subject'],
            Calendar: ['subject', 'eventType']
        };

        if (!allowedSources.includes(source)) {
            return res.status(400).json({ error: `Invalid source. Allowed: ${allowedSources.join(', ')}` });
        }
        if (!allowedTypes[source] || !allowedTypes[source].includes(type)) {
            return res.status(400).json({ error: `Invalid type '${type}' for source '${source}'. Allowed: ${allowedTypes[source].join(', ')}` });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const existingRule = user.whitelistRules.find(rule =>
            rule.source === source &&
            rule.type === type &&
            rule.value.toLowerCase() === value.toLowerCase()
        );

        if (existingRule) {
            existingRule.isUrgent = isUrgent;
            existingRule.isImportant = isImportant;
            existingRule.category = category;
            await user.save();
            return res.status(200).json({ message: 'Whitelist rule updated successfully.', rule: existingRule });
        } else {
            const newRule = { source, type, value, isUrgent, isImportant, category };
            user.whitelistRules.push(newRule);
            await user.save();
            return res.status(201).json({ message: 'Whitelist rule added successfully.', rule: newRule });
        }

    } catch (err) {
        console.error('Error managing whitelist:', err.message);
        res.status(500).json({ error: 'Failed to manage whitelist rule.', details: err.message });
    }
});

router.get('/manage-whitelist', async (req, res) => {
    try {
        const userId = req.cookies.user_id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }
        const user = await User.findById(userId, 'whitelistRules'); 
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json(user.whitelistRules);
    } catch (err) {
        console.error('Error fetching whitelist rules:', err.message);
        res.status(500).json({ error: 'Failed to fetch whitelist rules.', details: err.message });
    }
});

router.delete('/manage-whitelist/:ruleId', async (req, res) => {
    try {
        const userId = req.cookies.user_id;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated.' });
        }
        const { ruleId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const initialLength = user.whitelistRules.length;
        user.whitelistRules = user.whitelistRules.filter(rule => rule._id && rule._id.toString() !== ruleId);

        if (user.whitelistRules.length === initialLength) {
            return res.status(404).json({ error: 'Whitelist rule not found.' });
        }

        await user.save();
        res.status(200).json({ message: 'Whitelist rule deleted successfully.' });

    } catch (err) {
        console.error('Error deleting whitelist rule:', err.message);
        res.status(500).json({ error: 'Failed to delete whitelist rule.', details: err.message });
    }
});

module.exports = router;