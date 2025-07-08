const express = require('express');
const router = express.Router();
const axios = require('axios');
const User = require('../models/User');

// Helper function to fetch PR details
async function fetchPRDetails(prUrl, token) {
    try {
        const response = await axios.get(prUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching PR details:', error.message);
        return null;
    }
}

// Helper function to fetch PR comments
async function fetchPRComments(commentsUrl, token) {
    try {
        const response = await axios.get(commentsUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching PR comments:', error.message);
        return [];
    }
}

// Helper function to fetch issue comments (for PR discussions)
async function fetchIssueComments(issueCommentsUrl, token) {
    try {
        const response = await axios.get(issueCommentsUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching issue comments:', error.message);
        return [];
    }
}

// Helper function to fetch all PRs for a user's repositories
async function fetchUserPRs(token) {
    try {
        // First, get user's repositories
        const reposResponse = await axios.get('https://api.github.com/user/repos', {
            headers: {
                Authorization: `Bearer ${token}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
            params: {
                per_page: 100, // Adjust as needed
                sort: 'updated'
            }
        });

        const repos = reposResponse.data;
        const allPRs = [];

        // Fetch PRs for each repository
        for (const repo of repos) {
            try {
                const prsResponse = await axios.get(`https://api.github.com/repos/${repo.full_name}/pulls`, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'X-GitHub-Api-Version': '2022-11-28'
                    },
                    params: {
                        state: 'all', // Get open, closed, and merged PRs
                        per_page: 10, // Limit per repo
                        sort: 'updated'
                    }
                });

                const repoPRs = prsResponse.data.map(pr => ({
                    ...pr,
                    repository: repo
                }));

                allPRs.push(...repoPRs);
            } catch (error) {
                console.error(`Error fetching PRs for ${repo.full_name}:`, error.message);
            }
        }

        return allPRs;
    } catch (error) {
        console.error('Error fetching user PRs:', error.message);
        return [];
    }
}

router.get('/', async (req, res) => {
    try {
        const userId = req.cookies.user_id;

        // 1. Check if the user is logged into the main dashboard (has a user_id cookie)
        if (!userId) {
            return res.status(401).json({ error: 'Not logged into dashboard.' });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(401).json({ error: 'User not found for provided session.' });
        }

        // 2. Check if the user has linked their GitHub account
        if (!user.githubAccessToken) {
            return res.status(200).json({ status: 'github_not_linked', message: 'GitHub account is not linked.' });
        }

        // Fetch notifications
        const notificationsResponse = await axios.get('https://api.github.com/notifications', {
            headers: {
                Authorization: `Bearer ${user.githubAccessToken}`,
                'X-GitHub-Api-Version': '2022-11-28'
            },
        });

        // Fetch user's PRs
        const userPRs = await fetchUserPRs(user.githubAccessToken);

        // Process notifications with enhanced PR data
        const notifications = await Promise.all(
            notificationsResponse.data.map(async (n) => {
                let prDetails = null;
                let prComments = [];
                let issueComments = [];

                // If this is a PR-related notification, fetch additional details
                if (n.subject.type === 'PullRequest' && n.subject.url) {
                    prDetails = await fetchPRDetails(n.subject.url, user.githubAccessToken);
                    
                    if (prDetails) {
                        // Fetch PR review comments
                        if (prDetails.review_comments > 0) {
                            prComments = await fetchPRComments(prDetails.review_comments_url, user.githubAccessToken);
                        }
                        
                        // Fetch issue comments (general discussion)
                        if (prDetails.comments > 0) {
                            issueComments = await fetchIssueComments(prDetails.comments_url, user.githubAccessToken);
                        }
                    }
                }

                return {
                    id: n.id,
                    source: 'GitHub',
                    title: n.subject.title,
                    type: n.subject.type,
                    repo: n.repository.full_name,
                    timestamp: n.updated_at,
                    reason: n.reason,
                    isUrgent: n.reason === 'security_alert' || n.reason === 'mention' || n.reason === 'review_requested',
                    isImportant: n.reason === 'assign' || n.reason === 'review_requested' || n.reason === 'state_change',
                    summary: `Notification from ${n.repository.full_name}: ${n.subject.title}`,
                    link: n.subject.url ? n.subject.url.replace('api.github.com/repos/', 'github.com/') : n.repository.html_url,
                    
                    // Enhanced PR data
                    prDetails: prDetails ? {
                        number: prDetails.number,
                        state: prDetails.state,
                        merged: prDetails.merged,
                        draft: prDetails.draft,
                        author: prDetails.user.login,
                        assignees: prDetails.assignees.map(a => a.login),
                        reviewers: prDetails.requested_reviewers.map(r => r.login),
                        labels: prDetails.labels.map(l => l.name),
                        mergeable: prDetails.mergeable,
                        mergeable_state: prDetails.mergeable_state,
                        created_at: prDetails.created_at,
                        updated_at: prDetails.updated_at,
                        closed_at: prDetails.closed_at,
                        merged_at: prDetails.merged_at,
                        body: prDetails.body,
                        additions: prDetails.additions,
                        deletions: prDetails.deletions,
                        changed_files: prDetails.changed_files,
                        commits: prDetails.commits,
                        review_comments: prDetails.review_comments,
                        comments: prDetails.comments
                    } : null,
                    
                    // PR Comments
                    prComments: prComments.map(comment => ({
                        id: comment.id,
                        author: comment.user.login,
                        body: comment.body,
                        created_at: comment.created_at,
                        updated_at: comment.updated_at,
                        path: comment.path,
                        line: comment.line,
                        diff_hunk: comment.diff_hunk
                    })),
                    
                    // Issue Comments (general discussion)
                    issueComments: issueComments.map(comment => ({
                        id: comment.id,
                        author: comment.user.login,
                        body: comment.body,
                        created_at: comment.created_at,
                        updated_at: comment.updated_at
                    }))
                };
            })
        );

        // Process user's PRs
        const prsWithComments = await Promise.all(
            userPRs.slice(0, 20).map(async (pr) => { // Limit to 20 recent PRs
                let prComments = [];
                let issueComments = [];

                // Fetch PR review comments
                if (pr.review_comments > 0) {
                    prComments = await fetchPRComments(pr.review_comments_url, user.githubAccessToken);
                }
                
                // Fetch issue comments
                if (pr.comments > 0) {
                    issueComments = await fetchIssueComments(pr.comments_url, user.githubAccessToken);
                }

                return {
                    id: `pr_${pr.id}`,
                    source: 'GitHub',
                    title: pr.title,
                    type: 'PullRequest',
                    repo: pr.repository.full_name,
                    timestamp: pr.updated_at,
                    reason: 'pr_activity',
                    isUrgent: pr.state === 'open' && pr.requested_reviewers.length > 0,
                    isImportant: pr.state === 'open' || pr.merged_at,
                    summary: `PR #${pr.number}: ${pr.title}`,
                    link: pr.html_url,
                    
                    prDetails: {
                        number: pr.number,
                        state: pr.state,
                        merged: pr.merged,
                        draft: pr.draft,
                        author: pr.user.login,
                        assignees: pr.assignees.map(a => a.login),
                        reviewers: pr.requested_reviewers.map(r => r.login),
                        labels: pr.labels.map(l => l.name),
                        mergeable: pr.mergeable,
                        mergeable_state: pr.mergeable_state,
                        created_at: pr.created_at,
                        updated_at: pr.updated_at,
                        closed_at: pr.closed_at,
                        merged_at: pr.merged_at,
                        body: pr.body,
                        additions: pr.additions,
                        deletions: pr.deletions,
                        changed_files: pr.changed_files,
                        commits: pr.commits,
                        review_comments: pr.review_comments,
                        comments: pr.comments
                    },
                    
                    prComments: prComments.map(comment => ({
                        id: comment.id,
                        author: comment.user.login,
                        body: comment.body,
                        created_at: comment.created_at,
                        updated_at: comment.updated_at,
                        path: comment.path,
                        line: comment.line,
                        diff_hunk: comment.diff_hunk
                    })),
                    
                    issueComments: issueComments.map(comment => ({
                        id: comment.id,
                        author: comment.user.login,
                        body: comment.body,
                        created_at: comment.created_at,
                        updated_at: comment.updated_at
                    }))
                };
            })
        );

        // Combine notifications and PRs, sort by timestamp
        const combinedData = [...notifications, ...prsWithComments]
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json({
            notifications: combinedData,
            summary: {
                total: combinedData.length,
                notifications: notifications.length,
                pullRequests: prsWithComments.length,
                urgent: combinedData.filter(item => item.isUrgent).length,
                important: combinedData.filter(item => item.isImportant).length
            }
        });

    } catch (err) {
        console.error('GitHub Notifications Error:', err.response?.data?.message || err.message);
        
        if (err.response && err.response.status === 401) {
            return res.status(401).json({ 
                error: 'GitHub access token invalid or expired. Please re-authenticate.', 
                status: 'github_auth_error' 
            });
        }
        
        res.status(500).json({ 
            error: 'Failed to fetch GitHub notifications. Please try again later.' 
        });
    }
});

// Additional route to get specific PR details
router.get('/pr/:owner/:repo/:number', async (req, res) => {
    try {
        const userId = req.cookies.user_id;
        const { owner, repo, number } = req.params;

        if (!userId) {
            return res.status(401).json({ error: 'Not logged into dashboard.' });
        }

        const user = await User.findById(userId);
        if (!user || !user.githubAccessToken) {
            return res.status(401).json({ error: 'GitHub authentication required.' });
        }

        // Fetch PR details
        const prResponse = await axios.get(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
            headers: {
                Authorization: `Bearer ${user.githubAccessToken}`,
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        const pr = prResponse.data;

        // Fetch comments
        const [reviewComments, issueComments] = await Promise.all([
            fetchPRComments(pr.review_comments_url, user.githubAccessToken),
            fetchIssueComments(pr.comments_url, user.githubAccessToken)
        ]);

        res.json({
            pr: {
                ...pr,
                review_comments_data: reviewComments,
                issue_comments_data: issueComments
            }
        });

    } catch (err) {
        console.error('PR Details Error:', err.response?.data?.message || err.message);
        res.status(500).json({ error: 'Failed to fetch PR details.' });
    }
});

module.exports = router;