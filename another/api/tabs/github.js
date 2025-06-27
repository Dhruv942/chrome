const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');

router.get('/', async (req, res) => {
    try {
        const userId = req.cookies.user_id;

        // 1. Check if the user is logged into the main dashboard (has a user_id cookie)
        if (!userId) {
            // This case indicates the primary dashboard session is not established.
            // The frontend's fetchData function will catch this 401 and redirect to overall login.
            return res.status(401).json({ error: 'Not logged into dashboard.' });
        }

        const user = await User.findById(userId);

        if (!user) {
            // User ID in cookie is invalid or user doesn't exist
            // This also implies the primary dashboard session is broken.
            return res.status(401).json({ error: 'User not found for provided session.' });
        }

        // 2. Check if the user has linked their GitHub account
        if (!user.githubAccessToken) {
            // User is logged into the dashboard, but GitHub is not linked.
            // Return a 200 OK with a specific status flag for the frontend.
            return res.status(200).json({ status: 'github_not_linked', message: 'GitHub account is not linked.' });
        }

        // If GitHub is linked, proceed to fetch notifications
        const response = await axios.get('https://api.github.com/notifications', {
            headers: {
                Authorization: `Bearer ${user.githubAccessToken}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
        });

        const notifications = response.data.map(n => ({
            id: n.id,
            source: 'GitHub', // Ensure source is 'GitHub' for consistent rendering
            title: n.subject.title,
            type: n.subject.type,
            repo: n.repository.full_name,
            timestamp: n.updated_at,
            // Example of how you might determine importance from GitHub notifications
            // This is placeholder logic, you'd need to define what makes a GitHub notification urgent/important
            isUrgent: n.reason === 'security_alert' || n.reason === 'mention', // Just examples
            isImportant: n.reason === 'assign' || n.reason === 'review_requested', // Just examples
            summary: `Notification from ${n.repository.full_name}: ${n.subject.title}`,
            link: n.subject.url ? n.subject.url.replace('api.github.com/repos/', 'github.com/') : n.repository.html_url // Construct a user-friendly link
        }));

        res.json(notifications);

    } catch (err) {
        console.error('GitHub Notifications Error:', err.response?.data?.message || err.message);
        // Differentiate between GitHub API errors and internal errors
        if (err.response && err.response.status === 401) {
            // GitHub API token expired or invalid for this request
            // Frontend might need to show a specific message or trigger re-authentication for GitHub
            return res.status(401).json({ error: 'GitHub access token invalid or expired. Please re-authenticate.', status: 'github_auth_error' });
        }
        res.status(500).json({ error: 'Failed to fetch GitHub notifications. Please try again later.' });
    }
});

module.exports = router;