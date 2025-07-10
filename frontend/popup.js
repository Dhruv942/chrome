document.addEventListener('DOMContentLoaded', initializeExtension);

const BASE_API_URL = 'https://gonotifai.com/api/tab'; // Base URL for all your tab APIs
const AUTH_API_URL = 'https://gonotifai.com/api/auth'; // Base URL for authentication APIs

// --- UI Elements (Global Declarations - assigned in initializeExtension) ---
let loadingSpinner;
let errorMessageDiv;
let statusMessageDiv; // NEW: Status message div

// Login UI elements
let loginContainer;
let googleLoginBtn;
let privacyLinkBtn; // New: Reference for the privacy link button
let currentYearSpan; // New: Reference for the current year span
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

// Define PLATFORM_ICONS (Icons from FontAwesome are preferred if available)
const PLATFORM_ICONS = {
    Gmail: `<i class="fa-solid fa-envelope"></i>`,
    LinkedIn: `<i class="fa-brands fa-linkedin"></i>`,
    GitHub: `<i class="fa-brands fa-github"></i>`,
    Calendar: `<i class="fa-solid fa-calendar-days"></i>`,
    // Fallback or generic icons for other categories not directly represented by FontAwesome tabs
    JobPortal: `<i class="fa-solid fa-briefcase"></i>`, // Example: Using briefcase for job portal
    SocialMedia: `<i class="fa-solid fa-share-nodes"></i>`, // Example: Using share nodes for social media
    Newsletter: `<i class="fa-solid fa-newspaper"></i>`, // Example: Using newspaper for newsletter
    Error: `<i class="fa-solid fa-exclamation-circle"></i>`,
    Unknown: `<i class="fa-solid fa-question-circle"></i>`
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

// Function to show global loading spinner and message
function showLoading(isModal = false, message = "") {
    if (isModal) {
        if (modalLoadingSpinner) modalLoadingSpinner.classList.remove('hidden');
        if (modalErrorMessageDiv) {
            modalErrorMessageDiv.classList.remove('visible');
            modalErrorMessageDiv.textContent = '';
        }
    } else {
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');
        if (statusMessageDiv && message) { // Only show status message if provided
            statusMessageDiv.textContent = message;
            statusMessageDiv.classList.remove('hidden');
        }
        if (errorMessageDiv) {
            errorMessageDiv.classList.remove('visible');
            errorMessageDiv.textContent = '';
        }
    }
}

// Function to hide global loading spinner and message
function hideLoading(isModal = false) {
    if (isModal) {
        if (modalLoadingSpinner) modalLoadingSpinner.classList.add('hidden');
    } else {
        if (loadingSpinner) loadingSpinner.classList.add('hidden');
        if (statusMessageDiv) {
            statusMessageDiv.classList.add('hidden');
            statusMessageDiv.textContent = ''; // Clear message
        }
    }
}

function showErrorMessage(message, isModal = false) {
    // Ensure loading spinner and status message are hidden if an error pops up
    hideLoading(isModal); 

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
    showLoading(options.isModal, options.statusMessage); // Pass status message for global loading
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
    let badgeBgColor = 'badge-default'; // Default badge for custom categories or AI failed
    let label = '';

    // Determine importance based on flags/category
    if (item.category && item.category.toLowerCase().includes('critical')) {
        importanceLevel = Importance.Critical;
        label = 'Critical';
    } else if (item.isUrgent) {
        importanceLevel = Importance.Urgent;
        label = 'Urgent';
    } else if (item.isImportant) {
        importanceLevel = Importance.High;
        label = 'High';
    }

    // Assign badge color based on determined importance level
    switch (importanceLevel) {
        case Importance.Critical:
            badgeBgColor = 'badge-critical';
            break;
        case Importance.Urgent:
            badgeBgColor = 'badge-urgent';
            break;
        case Importance.High:
            badgeBgColor = 'badge-high';
            break;
        default:
            // Handle specific categories that aren't critical/urgent/high by default flags
            if (item.category === 'Whitelisted Item') {
                badgeBgColor = 'priority-whitelisted';
                label = 'Whitelisted'; // Explicitly set label for whitelisted
            } else if (item.category === 'AI Analysis Failed') {
                badgeBgColor = 'badge-default'; // Or a specific error badge color
                label = 'AI Error';
            } else if (item.category) {
                badgeBgColor = 'badge-default'; // Use default badge for other custom categories
                label = item.category;
            } else {
                // If no specific category or importance, no label or default badge
                label = '';
                badgeBgColor = ''; // No badge if no label
            }
            break;
    }

    return { importanceLevel, badgeBgColor, label };
};


// --- renderItems function (Fixed with proper item ID handling and whitelist sidebar color) ---
function renderItems(items, containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`Error: Container with ID '${containerId}' not found for rendering items.`);
        return;
    }
    container.innerHTML = ''; // Clear previous items

    if (!items || items.length === 0) {
        container.innerHTML = `<p class="empty-state">No ${containerId.replace('-list', '').replace('-', ' ')} found.</p>`;
        return;
    }

    const getPlatformIcon = (platform) => PLATFORM_ICONS[platform] || PLATFORM_ICONS['Unknown'];

    items.forEach(item => {
        const { importanceLevel, badgeBgColor, label } = getImportanceStyles(item);
        
        let sideBarColorClass = 'bg-gray-300'; // Default for items with no specific importance
        if (importanceLevel === Importance.Critical) {
            sideBarColorClass = 'bg-accent-critical';
        } else if (importanceLevel === Importance.Urgent) {
            sideBarColorClass = 'bg-accent-urgent';
        } else if (importanceLevel === Importance.High) {
            sideBarColorClass = 'bg-accent-high';
        } else if (item.category === 'Whitelisted Item') { // NEW: Whitelisted specific sidebar color
            sideBarColorClass = 'bg-accent-whitelisted';
        }

        // Only show importance UI elements if there's a specific importance level or a custom category/whitelisted status
        const showImportanceUI = importanceLevel !== Importance.Default || item.category === 'Whitelisted Item' || item.category === 'AI Analysis Failed' || (item.category && item.category !== 'Default');

        // Determine sender/actor name for display
        let senderInfoHtml = '';
        if (item.source === 'Gmail' && item.from) {
            senderInfoHtml = `<span class="item-sender-name">${item.from}</span>`;
        } else if (item.source === 'GitHub' && item.actor) { // Assuming GitHub items have an 'actor' field
            senderInfoHtml = `<span class="item-sender-name">${item.actor}</span>`;
        }
        // Add other platforms if they have a 'sender' or 'author' field, e.g.:
        // else if (item.source === 'LinkedIn' && item.author) {
        //     senderInfoHtml = `<span class="item-sender-name">${item.author}</span>`;
        // }


        const itemCard = document.createElement('div');
        itemCard.classList.add('item-card');
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
                        ${senderInfoHtml}
                        ${(label && showImportanceUI) ? `<span class="importance-badge ${badgeBgColor}">${label}</span>` : ''}
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
            // Find the item card by data attribute
            const itemElement = gmailListContainer.querySelector(`[data-item-id="${messageId}"]`);
            if (itemElement) {
                itemElement.remove();
                // Check if list is now empty and new empty state
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
        const gmailItems = data.map(item => ({ ...item, isUnread: true })); // Assume all fetched are unread initially
        renderItems(gmailItems, 'gmail-list');
        loadedTabs.gmail = true;
    } else if (data && data.status === 'not_logged_in') {
        showLoginUI();
    }
}

async function loadLinkedIn() {
    const data = await fetchData('/linkedin');
    if (data && data.status !== 'not_logged_in') {
        renderItems(data, 'linkedin-list');
        loadedTabs.linkedin = true;
    } else if (data && data.status === 'not_logged_in') {
        showLoginUI();
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
    } else if (data && data.status === 'not_logged_in') {
        showLoginUI();
    }
}

// --- Tab Switching Logic ---
function switchTab(tabId) {
    // Deactivate current tabs
    document.querySelectorAll('.tab-item').forEach(item => {
        item.classList.remove('active');
    });
    tabContents.forEach(content => {
        content.classList.remove('active', 'visible-opacity'); // Remove active and fade-in class from previous
    });

    // Activate new tab
    const newTabItem = document.querySelector(`.tab-item[data-tab="${tabId}"]`);
    const newTabContent = document.getElementById(`${tabId}-content`);

    if (newTabItem) newTabItem.classList.add('active');
    if (newTabContent) {
        newTabContent.classList.add('active'); // Set display to flex
        // Force reflow to ensure display property is applied before transition
        void newTabContent.offsetWidth; // This is a common trick to force a reflow
        newTabContent.classList.add('visible-opacity'); // Set opacity to 1 to trigger fade-in
    }

    currentActiveTab = tabId;
    clearErrorMessage();

    // Load data for the selected tab if not already loaded (or always for Gmail)
    if (!loadedTabs[tabId] || tabId === 'gmail') {
        switch (tabId) {
            case 'recommendations':
                loadRecommendations();
                break;
            case 'gmail':
                loadGmail();
                break;
            case 'linkedin':
                loadLinkedIn();
                break;
            case 'github':
                loadGitHub();
                break;
            case 'calendar':
                loadCalendar();
                break;
        }
    }
}

// --- Whitelist Management Logic ---
async function fetchWhitelistRules() {
    showLoading(false, "Loading whitelist rules..."); // Global loading message
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

            const urgencyLabel = (rule.isUrgent ? ' (Urgent)' : '');
            const importanceLabel = (rule.isImportant ? ' (Important)' : '');
            const categoryLabel = (rule.category && rule.category !== 'Whitelisted Item' ? ` [${rule.category}]` : '');

            const ruleText = `${rule.source}: ${rule.type} "${rule.value}"${urgencyLabel}${importanceLabel}${categoryLabel}`;
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
    const category = whitelistCategoryInput.value.trim() || 'Whitelisted Item'; // Default to 'Whitelisted Item'

    if (!source || !type || !value) {
        showErrorMessage('Please select source, type, and enter a value for the rule.');
        return;
    }

    showLoading(false, "Adding whitelist rule..."); // Global loading message
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

        await fetchWhitelistRules(); // Refresh chips
        // Clear input fields
        whitelistSourceSelect.value = '';
        whitelistTypeSelect.value = '';
        whitelistValueInput.value = '';
        whitelistUrgentCheckbox.checked = false;
        whitelistImportantCheckbox.checked = false;
        whitelistCategoryInput.value = ''; // Clear custom category input
        whitelistTypeSelect.disabled = true; // Disable type dropdown until source is selected again
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

    showLoading(false, "Removing whitelist rule..."); // Global loading message
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

        await fetchWhitelistRules(); // Refresh chips
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
    // Hide UI elements and show central loading message during initial check
    if (loginContainer) loginContainer.classList.add('hidden');
    if (dashboardContainer) dashboardContainer.classList.add('hidden');
    showLoading(false, "Verifying your session. Please wait..."); // Global loading message

    const response = await fetchData('/recommendations', { statusMessage: "Fetching recommendations..." });

    // Hide global loading message and spinner now that we have a response
    hideLoading();

    if (response && response.status === 'not_logged_in') {
        showLoginUI();
        clearErrorMessage();
    } else if (response) {
        showDashboardUI();
        attachDashboardEventListeners();
        
        // Render initial recommendations data (this is the default tab)
        renderItems(response, 'recommendations-list');
        loadedTabs.recommendations = true; // Mark as loaded

        // Manually activate the recommendations tab visuals and trigger fade-in
        const initialTabItem = document.querySelector('.tab-item[data-tab="recommendations"]');
        const initialTabContent = document.getElementById('recommendations-content');
        if (initialTabItem) {
            initialTabItem.classList.add('active');
        }
        if (initialTabContent) {
            initialTabContent.classList.add('active');
            // Force reflow before applying opacity to trigger CSS transition
            void initialTabContent.offsetWidth; 
            initialTabContent.classList.add('visible-opacity');
        }
        currentActiveTab = 'recommendations'; // Set the global active tab variable

    } else {
        // Fallback if fetchData returns null (e.g., API unreachable)
        showLoginUI();
        showErrorMessage("Could not connect to dashboard services. Please ensure the backend is running.");
    }
}

// --- Function to assign UI elements after DOM is loaded ---
function assignUIElements() {
    loadingSpinner = document.getElementById('loading-spinner');
    errorMessageDiv = document.getElementById('error-message');
    statusMessageDiv = document.getElementById('status-message'); // NEW: Get reference to status message div

    loginContainer = document.getElementById('login-container');
    googleLoginBtn = document.getElementById('google-login-btn');
    privacyLinkBtn = document.getElementById('privacy-link-btn'); // NEW: Assign privacy link button
    currentYearSpan = document.getElementById('current-year'); // NEW: Assign current year span
    githubLoginBtn = document.getElementById('github-login-btn-tab'); // The GitHub login button inside the tab

    dashboardContainer = document.getElementById('dashboard-container');
    tabsNav = document.querySelector('.tabs-nav');
    tabContents = document.querySelectorAll('.tab-content'); // NodeList of all tab content divs

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
    // Event listener for tab navigation
    if (tabsNav) {
        tabsNav.addEventListener('click', (event) => {
            const targetTabItem = event.target.closest('.tab-item');
            if (targetTabItem) {
                const tabId = targetTabItem.dataset.tab;
                switchTab(tabId);
            }
        });
    }

    // Event listeners for Whitelist sidebar
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

    // Event listener for Full Item Modal close button
    if (modalCloseBtn) {
        modalCloseBtn.addEventListener('click', closeFullItemModal);
    }

    // Event listener for GitHub login button within the GitHub tab
    if (githubLoginBtn) {
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

    // Set current year in the new footer
    if (currentYearSpan) {
        currentYearSpan.textContent = new Date().getFullYear();
    }

    // Attach login button listeners for initial login screen
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', () => {
            chrome.tabs.create({ url: `${AUTH_API_URL}/google` });
            showErrorMessage('Please log in in the new tab. After successful login, close that tab and then click the extension icon again to refresh this dashboard.');
        });
    }

    // Handle privacy policy link click (from the new login design)
    if (privacyLinkBtn) {
        privacyLinkBtn.addEventListener('click', () => {
            // Replace with your actual privacy policy URL
            chrome.tabs.create({ url: 'https://gonotifai.com/privacy' }); // Example URL
        });
    }

    // Check login status and display appropriate UI
    checkLoginStatus();
}