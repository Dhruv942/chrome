// popup.js
document.addEventListener('DOMContentLoaded', initializeExtension);

const BASE_API_URL = 'http://localhost:3000/api/tab'; // Base URL for all your tab APIs
const AUTH_API_URL = 'http://localhost:3000/api/auth'; // Base URL for authentication APIs

// --- UI Elements (Global Declarations - assigned in initializeExtension) ---
let loadingSpinner;
let errorMessageDiv;

// Login UI elements
let loginContainer;
let googleLoginBtn;
let githubLoginBtn; // Now refers to the button in the GitHub tab

// Dashboard UI elements
let dashboardContainer;
let tabsNav;
let tabContents; // NodeList, assigned later

// GitHub Specific UI elements
let githubAuthPrompt; // New element for GitHub authentication prompt

// Whitelist Sidebar Elements
let manageWhitelistBtn;
let whitelistSidebar;
let closeWhitelistBtn;
let whitelistSourceSelect;
let whitelistTypeSelect;
let whitelistValueInput;
let whitelistUrgentCheckbox;
let whitelistImportantCheckbox;
let whitelistCategoryInput;
let addWhitelistBtn;
let whitelistChipsContainer;
let whitelistEmptyState;

// Modal Elements
let fullItemModal;
let modalCloseBtn;
let modalTitle;
let modalFullContent;
let modalActions;
let modalLoadingSpinner;
let modalErrorMessageDiv;

// Mapped types for whitelist dropdowns
const WHITELIST_TYPES = {
    Gmail: ['sender', 'subject', 'body'],
    GitHub: ['repository', 'subject'],
    Calendar: ['subject', 'eventType']
};

let currentActiveTab = 'recommendations';
let loadedTabs = {};
let currentWhitelistRules = [];

// Define Importance Enum
const Importance = {
    Critical: 'Critical',
    Urgent: 'Urgent',
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
    Default: 'Default'
};

// Define PLATFORM_ICONS
const PLATFORM_ICONS = {
    Gmail: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 4H2C.9 4 0 4.9 0 6v12c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H2V8l10 6 10-6v10zM12 11L2 5h20l-10 6z"/></svg>`,
    LinkedIn: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.761 0 5-2.239 5-5v-14c0-2.761-2.239-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.768s.784-1.768 1.75-1.768 1.75.79 1.75 1.768-.783 1.768-1.75 1.768zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>`,
    GitHub: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.082 1.838 1.235 1.838 1.235 1.07 1.835 2.809 1.305 3.493.998.108-.776.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>`,
    Calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11zm-5-5h-2v2h2v-2zm0-4h-2v2h2v-2zm4 0h-2v2h2v-2z"/></svg>`,
    JobPortal: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M10 16.5l6-6-6-6v12z"/><path d="M0 0h24v24H0V0z" fill="none"/></svg>`,
    SocialMedia: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6zm-2 0l-8 5-8-5h16zm0 12H4V8l8 5 8-5v10z"/></svg>`,
    Newsletter: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 6h16v2H4V6zm0 12V10h16v8H4zm4-5h4v-2H8v2zm5 0h4v-2h-4v2z"/></svg>`,
    Error: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>`,
    Unknown: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM4 20V4h16l.01 16H4zm9-5h2v2h-2zm0-4h2v2h-2zm0-4h2v2h-2z"/></svg>`
};

// --- UI Visibility Functions ---
function showLoginUI() {
    if (loginContainer) loginContainer.classList.remove('hidden');
    if (dashboardContainer) dashboardContainer.classList.add('hidden');
}

function showDashboardUI() {
    if (loginContainer) loginContainer.classList.add('hidden');
    if (dashboardContainer) dashboardContainer.classList.remove('hidden');
}

function showLoading(isModal = false) {
    if (isModal) {
        if (modalLoadingSpinner) modalLoadingSpinner.classList.remove('hidden');
        if (modalErrorMessageDiv) {
            modalErrorMessageDiv.classList.remove('visible');
            modalErrorMessageDiv.textContent = '';
        }
    } else {
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');
        if (errorMessageDiv) {
            errorMessageDiv.classList.remove('visible');
            errorMessageDiv.textContent = '';
        }
    }
}

function hideLoading(isModal = false) {
    if (isModal) {
        if (modalLoadingSpinner) modalLoadingSpinner.classList.add('hidden');
    } else {
        if (loadingSpinner) loadingSpinner.classList.add('hidden');
    }
}

function showErrorMessage(message, isModal = false) {
    if (isModal) {
        if (modalErrorMessageDiv) {
            modalErrorMessageDiv.textContent = message;
            modalErrorMessageDiv.classList.add('visible');
        }
    } else {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = message;
            errorMessageDiv.classList.add('visible');
        }
    }
}

function clearErrorMessage(isModal = false) {
    if (isModal) {
        if (modalErrorMessageDiv) {
            modalErrorMessageDiv.textContent = '';
            modalErrorMessageDiv.classList.remove('visible');
        }
    } else {
        if (errorMessageDiv) {
            errorMessageDiv.textContent = '';
            errorMessageDiv.classList.remove('visible');
        }
    }
}

async function fetchData(endpoint, options = {}) {
    showLoading(options.isModal);
    clearErrorMessage(options.isModal);
    try {
        const response = await fetch(`${BASE_API_URL}${endpoint}`, {
            credentials: 'include',
            ...options
        });

        // If general dashboard auth fails
        if (response.status === 401 || response.status === 404) {
            console.warn(`Fetch ${endpoint}: Authentication required or user not found. Status: ${response.status}`);
            return { status: 'not_logged_in' };
        }

        // If response is not OK for other reasons (e.g., 500, or other specific errors not caught above)
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Specific handling for GitHub 'not linked' status returned with 200 OK
        if (endpoint.includes('/github') && data && data.status === 'github_not_linked') {
             return { status: 'github_not_linked' };
        }

        return data;

    } catch (error) {
        console.error(`Error fetching ${endpoint}:`, error);
        showErrorMessage(`Connection error to API: ${error.message}`, options.isModal);
        return null;
    } finally {
        hideLoading(options.isModal);
    }
}

// Helper to determine importance styles
const getImportanceStyles = (item) => {
    let importanceLevel = Importance.Default;
    let badgeBgColor = 'badge-default';
    let textColor = 'text-gray-500';
    let label = '';

    if (item.category && item.category.toLowerCase().includes('critical')) {
        importanceLevel = Importance.Critical;
    } else if (item.isUrgent) {
        importanceLevel = Importance.Urgent;
    } else if (item.isImportant) {
        importanceLevel = Importance.High;
    }

    switch (importanceLevel) {
        case Importance.Critical:
            badgeBgColor = 'badge-critical';
            textColor = 'text-white';
            label = 'Critical';
            break;
        case Importance.Urgent:
            badgeBgColor = 'badge-urgent';
            textColor = 'text-white';
            label = 'Urgent';
            break;
        case Importance.High:
            badgeBgColor = 'badge-high';
            textColor = 'text-accent-high-text';
            label = 'High';
            break;
        case Importance.Default:
            if (item.category === 'Whitelisted Item') {
                badgeBgColor = 'priority-whitelisted';
                textColor = 'text-white';
                label = 'Whitelisted';
            } else if (item.category === 'AI Analysis Failed') {
                badgeBgColor = 'badge-default';
                textColor = 'text-white';
                label = 'AI Error';
            } else if (item.category) {
                badgeBgColor = 'badge-default';
                textColor = 'text-white';
                label = item.category;
            } else {
                badgeBgColor = 'badge-default';
                textColor = 'text-gray-500';
                label = '';
            }
            break;
    }
    return { importanceLevel, badgeBgColor, textColor, label };
};

// --- renderItems function (Fixed with proper item ID handling) ---
function renderItems(items, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Error: Container with ID '${containerId}' not found for rendering items.`);
        return;
    }
    container.innerHTML = '';

    if (!items || items.length === 0) {
        container.innerHTML = `<p class="empty-state">No ${containerId.replace('-list', '').replace('-', ' ')} found.</p>`;
        return;
    }

    const getPlatformIcon = (platform) => PLATFORM_ICONS[platform] || PLATFORM_ICONS['Unknown'];

    items.forEach(item => {
        const { importanceLevel, badgeBgColor, textColor, label } = getImportanceStyles(item);
        const showImportanceUI = importanceLevel !== Importance.Default || item.category === 'Whitelisted Item' || item.category === 'AI Analysis Failed';

        const sideBarColorClass = importanceLevel === Importance.Critical ? 'bg-accent-critical' : (importanceLevel === Importance.Urgent ? 'bg-accent-urgent' : (importanceLevel === Importance.High ? 'bg-accent-high' : 'bg-gray-300'));

        const itemCard = document.createElement('div');
        itemCard.classList.add('item-card');
        if (showImportanceUI) {
            itemCard.classList.add('has-sidebar');
        }
        itemCard.setAttribute('role', 'article');
        itemCard.setAttribute('aria-labelledby', `notification-title-${item.id}`);
        itemCard.setAttribute('aria-describedby', `notification-status-${item.id}`);

        // Store the item data as a data attribute for easy access
        itemCard.setAttribute('data-item-id', item.id);

        itemCard.innerHTML = `
            ${showImportanceUI ? `<div class="item-card-sidebar ${sideBarColorClass}" aria-hidden="true"></div>` : ''}
            <div class="item-card-inner-content">
                <div class="item-card-header-main">
                    <div class="item-platform-info">
                        <span class="item-platform-icon" aria-hidden="true">${getPlatformIcon(item.source)}</span>
                        <span class="item-platform-name">${item.source}</span>
                        ${(label && showImportanceUI) ? `<span class="importance-badge ${badgeBgColor} ${badgeBgColor === 'badge-high' ? 'text-accent-high-text' : 'text-white'}">${label}</span>` : ''}
                    </div>
                    <div class="item-card-actions">
                        <button
                            class="read-full-button item-details-link"
                            aria-label="View full ${item.source} item"
                            title="View full ${item.source} item"
                        >
                            View Full
                        </button>
                    </div>
                </div>
                <h3 id="notification-title-${item.id}" class="item-title">${item.title || '(No Subject)'}</h3>
                <p class="item-summary">${item.summary || item.snippet || '(No content available)'}</p>
            </div>
            <span id="notification-status-${item.id}" class="sr-only">Status: Click "View Full" to view details.</span>
        `;

        const viewFullButton = itemCard.querySelector('.read-full-button');
        if (viewFullButton) {
            viewFullButton.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('View Full button clicked for item:', item.id);
                openFullItemModal(item);
            });
        }

        container.appendChild(itemCard);
    });
}

// --- FIXED: Full Item View Modal Logic ---
async function openFullItemModal(item) {
    console.log('Opening modal for item:', item);

    if (!fullItemModal || !modalTitle || !modalFullContent || !modalActions || !modalLoadingSpinner || !modalErrorMessageDiv) {
        console.error("Modal UI elements not found in DOM.");
        showErrorMessage("Dashboard UI not fully loaded. Please close and reopen the extension.", false);
        return;
    }

    // Show modal immediately
    fullItemModal.classList.remove('hidden');
    fullItemModal.classList.add('visible');

    // Clear previous content
    modalTitle.textContent = item.title || '(No Title)';
    modalFullContent.innerHTML = '';
    modalActions.innerHTML = '';

    // Show loading state
    showLoading(true);
    clearErrorMessage(true);

    try {
        let fullContent = item.fullContent || item.snippet || '(Loading full content...)';

        // FIXED: Fetch full content for Gmail items
        if (item.source === 'Gmail') {
            console.log('Fetching full Gmail content for ID:', item.id);
            const gmailFullData = await fetchData(`/gmail/${item.id}/full`, { isModal: true });

            if (gmailFullData && gmailFullData.fullContent) {
                fullContent = gmailFullData.fullContent;
                item.fullContent = fullContent;
                if (gmailFullData.link) {
                    item.link = gmailFullData.link;
                }
                console.log('Successfully loaded Gmail full content');
            } else {
                console.error('Failed to load Gmail full content:', gmailFullData);
                fullContent = 'Failed to load full email content.';
                showErrorMessage(gmailFullData ? (gmailFullData.error || 'Failed to load full email content.') : 'Failed to load full email content.', true);
            }
        }

        // Display content
        modalFullContent.innerHTML = `<pre style="white-space: pre-wrap; word-wrap: break-word;">${fullContent}</pre>`;

        // FIXED: Add action buttons
        if (item.source === 'Gmail' && item.isUnread) {
            const markAsReadBtn = document.createElement('button');
            markAsReadBtn.classList.add('mark-read-btn');
            markAsReadBtn.textContent = 'Mark as Read';
            markAsReadBtn.addEventListener('click', async () => {
                console.log('Mark as Read button clicked for item:', item.id);
                const success = await markEmailAsReadAndReloadGmail(item.id);
                if (success) {
                    closeFullItemModal();
                }
            });
            modalActions.appendChild(markAsReadBtn);
        }

        if (item.link) {
            const openLinkBtn = document.createElement('button');
            openLinkBtn.classList.add('secondary');
            openLinkBtn.textContent = `Open in ${item.source}`;
            openLinkBtn.addEventListener('click', () => {
                chrome.tabs.create({ url: item.link });
                closeFullItemModal();
            });
            modalActions.appendChild(openLinkBtn);
        }

    } catch (error) {
        console.error('Error opening full item modal:', error);
        if (modalFullContent) {
             modalFullContent.innerHTML = `<p class="error-message visible">Error loading content: ${error.message}</p>`;
        }
        showErrorMessage(`Error loading content: ${error.message}`, true);
    } finally {
        hideLoading(true);
    }
}

function closeFullItemModal() {
    if (fullItemModal) {
        fullItemModal.classList.remove('visible');
        fullItemModal.classList.add('hidden');
    }
    if (modalFullContent) modalFullContent.innerHTML = '';
    if (modalActions) modalActions.innerHTML = '';
    if (modalErrorMessageDiv) modalErrorMessageDiv.classList.remove('visible');
    if (modalLoadingSpinner) modalLoadingSpinner.classList.add('hidden');
}

// --- FIXED: Mark as Read Logic for Gmail ---
async function markEmailAsRead(messageId) {
    console.log('Marking email as read:', messageId);
    showLoading(true);
    clearErrorMessage(true);

    try {
        const response = await fetch(`${BASE_API_URL}/gmail/mark-as-read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ messageId: messageId })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log(`Email ${messageId} marked as read successfully:`, result);
        return true;
    } catch (error) {
        console.error(`Error marking email ${messageId} as read:`, error);
        showErrorMessage(`Failed to mark as read: ${error.message}`, true);
        return false;
    } finally {
        hideLoading(true);
    }
}

async function markEmailAsReadAndReloadGmail(messageId) {
    const success = await markEmailAsRead(messageId);
    if (success) {
        const gmailListContainer = document.getElementById('gmail-list');
        if (gmailListContainer) {
            // FIXED: Find the item card by data attribute
            const itemElement = gmailListContainer.querySelector(`[data-item-id="${messageId}"]`);
            if (itemElement) {
                itemElement.remove();
                // Check if list is now empty and update empty state
                if (gmailListContainer.children.length === 0) {
                    gmailListContainer.innerHTML = '<p class="empty-state">No Gmail found.</p>';
                }
            } else {
                console.warn(`Could not find item element with ID: ${messageId}`);
            }
        }

        // Force reload the Gmail tab data to ensure consistency with backend
        loadedTabs.gmail = false;
        if (currentActiveTab === 'gmail') {
            loadGmail();
        }
    }
    return success;
}

// --- Data Fetching Functions for each tab ---
async function loadRecommendations() {
    const data = await fetchData('/recommendations');
    if (data && data.status !== 'not_logged_in') {
        renderItems(data, 'recommendations-list');
        loadedTabs.recommendations = true;
    } else if (data && data.status === 'not_logged_in') {
        showLoginUI();
    }
}

async function loadGmail() {
    const data = await fetchData('/gmail');
    if (data && data.status !== 'not_logged_in') {
        const gmailItems = data.map(item => ({ ...item, isUnread: true }));
        renderItems(gmailItems, 'gmail-list');
        loadedTabs.gmail = true;
    }
}

async function loadLinkedIn() {
    const data = await fetchData('/linkedin');
    if (data && data.status !== 'not_logged_in') {
        renderItems(data, 'linkedin-list');
        loadedTabs.linkedin = true;
    }
}

async function loadGitHub() {
    const githubListContainer = document.getElementById('github-list');
    const githubAuthPrompt = document.getElementById('github-auth-prompt');

    if (!githubListContainer || !githubAuthPrompt) {
        console.error("GitHub content containers not found. Cannot load GitHub data.");
        showErrorMessage("GitHub tab UI elements missing. Please reload extension.");
        return;
    }

    // Always clear list and hide prompt initially when loading this tab
    githubListContainer.innerHTML = `<p class="empty-state">Loading GitHub data...</p>`;
    githubListContainer.classList.remove('hidden'); // Show the loading message
    githubAuthPrompt.classList.add('hidden'); // Hide the auth prompt by default

    const data = await fetchData('/github');

    if (data === null) {
        // Error already handled by showErrorMessage in fetchData
        githubListContainer.innerHTML = `<p class="empty-state error">Failed to load GitHub data. Please check connection or try again.</p>`;
    } else if (data.status === 'not_logged_in') {
        // This indicates the main dashboard session is invalid
        showLoginUI();
    } else if (data.status === 'github_not_linked') {
        // User is logged into the dashboard, but GitHub account is not linked
        githubListContainer.innerHTML = ''; // Clear "Loading..." message
        githubListContainer.classList.add('hidden'); // Hide the list container
        githubAuthPrompt.classList.remove('hidden'); // Show the auth prompt
        loadedTabs.github = false; // Mark as not loaded yet until linked
        console.log("GitHub account not linked, showing authentication prompt.");
    } else {
        // Successfully loaded GitHub data
        githubAuthPrompt.classList.add('hidden'); // Hide the auth prompt
        githubListContainer.classList.remove('hidden'); // Show the list container
        renderItems(data, 'github-list');
        loadedTabs.github = true;
        console.log("GitHub data loaded successfully.");
    }
}

async function loadCalendar() {
    const data = await fetchData('/calendar');
    if (data && data.status !== 'not_logged_in') {
        renderItems(data, 'calendar-list');
        loadedTabs.calendar = true;
    }
}

// --- Tab Switching Logic ---
function switchTab(tabId) {
    document.querySelectorAll('.tab-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.tab === tabId) {
            item.classList.add('active');
        }
    });

    tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `${tabId}-content`) {
            content.classList.add('active');
        }
    });

    currentActiveTab = tabId;
    clearErrorMessage();

    // Force reload for Gmail or if tab not loaded yet
    if (tabId === 'gmail' && !loadedTabs.gmail) { // Always reload Gmail to get latest unread status
        loadGmail();
    } else if (tabId === 'github' && !loadedTabs.github) { // Load GitHub if not yet loaded
        loadGitHub();
    } else if (!loadedTabs[tabId]) { // For other tabs, load if not already loaded
        switch (tabId) {
            case 'recommendations':
                loadRecommendations();
                break;
            case 'linkedin':
                loadLinkedIn();
                break;
            case 'calendar':
                loadCalendar();
                break;
        }
    }
}

// --- Whitelist Management Logic ---
async function fetchWhitelistRules() {
    showLoading();
    clearErrorMessage();
    try {
        const response = await fetch(`${BASE_API_URL}/recommendations/manage-whitelist`, {
            credentials: 'include'
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        currentWhitelistRules = await response.json();
        renderWhitelistChips();
    } catch (error) {
        console.error('Error fetching whitelist rules:', error);
        showErrorMessage(`Failed to load whitelist rules: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function renderWhitelistChips() {
    if (!whitelistChipsContainer || !whitelistEmptyState) return;

    whitelistChipsContainer.innerHTML = '';

    if (currentWhitelistRules.length === 0) {
        whitelistEmptyState.style.display = 'block';
    } else {
        whitelistEmptyState.style.display = 'none';
        currentWhitelistRules.forEach(rule => {
            const chip = document.createElement('div');
            chip.classList.add('whitelist-chip');
            chip.dataset.ruleId = rule._id;

            const ruleText = `${rule.source}: ${rule.type} "${rule.value}"` +
                             (rule.isUrgent ? ' (Urgent)' : '') +
                             (rule.isImportant ? ' (Important)' : '') +
                             (rule.category !== 'Whitelisted Item' && rule.category ?  ` [${rule.category}]` : '');
            chip.textContent = ruleText;

            const removeBtn = document.createElement('button');
            removeBtn.classList.add('remove-chip-btn');
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => removeWhitelistRule(rule._id);
            chip.appendChild(removeBtn);

            whitelistChipsContainer.appendChild(chip);
        });
    }
}

async function addWhitelistRule() {
    if (!whitelistSourceSelect || !whitelistTypeSelect || !whitelistValueInput ||
        !whitelistUrgentCheckbox || !whitelistImportantCheckbox || !whitelistCategoryInput || !addWhitelistBtn) {
        console.error("Whitelist input elements not found. Reopening extension might help.");
        showErrorMessage("Whitelist UI not fully loaded. Please reopen the extension.", false);
        return;
    }

    const source = whitelistSourceSelect.value;
    const type = whitelistTypeSelect.value;
    const value = whitelistValueInput.value.trim();
    const isUrgent = whitelistUrgentCheckbox.checked;
    const isImportant = whitelistImportantCheckbox.checked;
    const category = whitelistCategoryInput.value.trim() || 'Whitelisted Item';

    if (!source || !type || !value) {
        showErrorMessage('Please select source, type, and enter a value for the rule.');
        return;
    }

    showLoading();
    clearErrorMessage();
    try {
        const response = await fetch(`${BASE_API_URL}/recommendations/manage-whitelist`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ source, type, value, isUrgent, isImportant, category })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Rule added/updated:', result);

        await fetchWhitelistRules();
        whitelistSourceSelect.value = '';
        whitelistTypeSelect.value = '';
        whitelistValueInput.value = '';
        whitelistUrgentCheckbox.checked = false;
        whitelistImportantCheckbox.checked = false;
        whitelistCategoryInput.value = 'Whitelisted Item';
        whitelistTypeSelect.disabled = true;
    } catch (error) {
        console.error('Error adding whitelist rule:', error);
        showErrorMessage(`Failed to add/update rule: ${error.message}`);
    } finally {
        hideLoading();
    }
}

async function removeWhitelistRule(ruleId) {
    if (!confirm('Are you sure you want to remove this whitelist rule?')) {
        return;
    }

    showLoading();
    clearErrorMessage();
    try {
        const response = await fetch(`${BASE_API_URL}/recommendations/manage-whitelist/${ruleId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Rule deleted:', result);

        await fetchWhitelistRules();
    } catch (error) {
        console.error('Error removing whitelist rule:', error);
        showErrorMessage(`Failed to remove rule: ${error.message}`);
    } finally {
        hideLoading();
    }
}

function updateWhitelistTypesDropdown() {
    if (!whitelistSourceSelect || !whitelistTypeSelect) return;

    const selectedSource = whitelistSourceSelect.value;
    whitelistTypeSelect.innerHTML = '<option value="">Select Type</option>';
    whitelistTypeSelect.disabled = true;

    if (selectedSource && WHITELIST_TYPES[selectedSource]) {
        WHITELIST_TYPES[selectedSource].forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type.charAt(0).toUpperCase() + type.slice(1);
            whitelistTypeSelect.appendChild(option);
        });
        whitelistTypeSelect.disabled = false;
    }
}

// --- Initial Login Check and Dashboard Initialization ---
async function checkLoginStatus() {
    showLoading();
    // Fetch recommendations to check if user is logged into the overall dashboard
    const response = await fetchData('/recommendations');

    if (response && response.status === 'not_logged_in') {
        showLoginUI();
        clearErrorMessage();
    } else if (response) {
        showDashboardUI();
        attachDashboardEventListeners();
        // Initial load for recommendations once dashboard is visible
        renderItems(response, 'recommendations-list');
        loadedTabs.recommendations = true;
    } else {
        // Fallback if fetchData returns null (e.g., API unreachable)
        showLoginUI();
        showErrorMessage("Could not connect to dashboard services. Please ensure the backend is running.");
    }
    hideLoading();
}

// --- Function to assign UI elements after DOM is loaded ---
function assignUIElements() {
    loadingSpinner = document.getElementById('loading-spinner');
    errorMessageDiv = document.getElementById('error-message');

    loginContainer = document.getElementById('login-container');
    googleLoginBtn = document.getElementById('google-login-btn');
    // GitHub login button is now inside the tab, so its ID is different
    githubLoginBtn = document.getElementById('github-login-btn-tab');

    dashboardContainer = document.getElementById('dashboard-container');
    tabsNav = document.querySelector('.tabs-nav');
    tabContents = document.querySelectorAll('.tab-content'); // NodeList

    // New: GitHub specific elements
    githubAuthPrompt = document.getElementById('github-auth-prompt');

    manageWhitelistBtn = document.getElementById('manage-whitelist-btn');
    whitelistSidebar = document.getElementById('whitelist-sidebar');
    closeWhitelistBtn = document.getElementById('close-whitelist-btn');
    whitelistSourceSelect = document.getElementById('whitelist-source');
    whitelistTypeSelect = document.getElementById('whitelist-type');
    whitelistValueInput = document.getElementById('whitelist-value-input');
    whitelistUrgentCheckbox = document.getElementById('whitelist-urgent');
    whitelistImportantCheckbox = document.getElementById('whitelist-important');
    whitelistCategoryInput = document.getElementById('whitelist-category-input');
    addWhitelistBtn = document.getElementById('add-whitelist-btn');
    whitelistChipsContainer = document.getElementById('whitelist-chips-container');
    whitelistEmptyState = document.getElementById('whitelist-empty-state');

    fullItemModal = document.getElementById('full-item-modal');
    modalCloseBtn = document.getElementById('modal-close-btn');
    modalTitle = document.getElementById('modal-title');
    modalFullContent = document.getElementById('modal-full-content');
    modalActions = document.getElementById('modal-actions');
    modalLoadingSpinner = document.getElementById('modal-loading-spinner');
    modalErrorMessageDiv = document.getElementById('modal-error-message');
}


function attachDashboardEventListeners() {
    // Check if elements are not null before attaching listeners
    if (tabsNav) {
        tabsNav.addEventListener('click', (event) => {
            if (event.target.classList.contains('tab-item')) {
                const tabId = event.target.dataset.tab;
                switchTab(tabId);
            }
        });
    }

    if (manageWhitelistBtn) {
        manageWhitelistBtn.addEventListener('click', () => {
            if (whitelistSidebar) whitelistSidebar.classList.add('open');
            fetchWhitelistRules();
        });
    }
    if (closeWhitelistBtn) {
        closeWhitelistBtn.addEventListener('click', () => {
            if (whitelistSidebar) whitelistSidebar.classList.remove('open');
            clearErrorMessage();
        });
    }

    if (whitelistSourceSelect) {
        whitelistSourceSelect.addEventListener('change', updateWhitelistTypesDropdown);
    }
    if (addWhitelistBtn) {
        addWhitelistBtn.addEventListener('click', addWhitelistRule);
    }
    // Attach modal close listener here too, now that modalCloseBtn is assigned
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeFullItemModal);
    }

    // Attach GitHub login listener (now only when dashboard is visible and button exists)
    if (githubLoginBtn) { // This now refers to the button INSIDE the tab
        githubLoginBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: `${AUTH_API_URL}/github` });
            // Update the hint in the GitHub tab's auth prompt
            const hint = githubAuthPrompt ? githubAuthPrompt.querySelector('.login-hint') : null;
            if (hint) {
                hint.textContent = 'A new tab opened for authentication. Close it after logging in, then reload this extension.';
            }
            // Also show a general message at the top level for user clarity
            showErrorMessage('Please log in in the new tab. After successful login, close that tab and then click the extension icon again to refresh this dashboard.', false);
        });
    }
}

// initializeExtension function now runs after DOMContentLoaded
// and is responsible for finding and assigning all UI elements.
function initializeExtension() {
    // Assign all UI elements here after DOMContentLoaded
    assignUIElements();

    // Attach login button listeners for initial login screen
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: `${AUTH_API_URL}/google` });
            showErrorMessage('Please log in in the new tab. After successful login, close that tab and then click the extension icon again to refresh this dashboard.');
        });
    }

    // Check login status and display appropriate UI
    checkLoginStatus();
}