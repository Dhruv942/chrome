// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.message === 'get_auth_token') {
    // The `interactive` flag will prompt the user to sign in if they aren't already.
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }
      // Send this token to your backend to validate and create a session.
      // Your backend at /api/auth/google should be ready to receive this token.
      fetch('http://localhost:3000/api/auth/google', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token: token }),
      })
      .then(response => {
        if (!response.ok) {
            throw new Error('Backend authentication failed.');
        }
        return response.json();
      })
      .then(data => {
        // Assuming your backend responds with a success message or user data
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        console.error('Error authenticating with backend:', error);
        sendResponse({ error: error.message });
      });
    });
    // Return true to indicate you wish to send a response asynchronously
    return true; 
  }
});