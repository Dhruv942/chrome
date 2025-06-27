// D:\Mobbana\another\api\utils\geminiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
        responseMimeType: 'application/json',
    }
});

async function analyzeEmail(email, retries = 3, initialDelay = 1000) {
    // Combine subject and snippet for better analysis
    const combinedContent = `Subject: "${email.subject}"\nSnippet: "${email.snippet}"`;

    const prompt = `
    Analyze the following email content and provide a structured JSON response.
    Content for analysis:
    ${combinedContent}

    From Address: "${email.from}"

    Your task is to determine the following properties:
    1.  "source": Identify the origin. If 'From Address' contains 'linkedin.com', 'indeed.com', 'naukri.com' set to "JobPortal". If 'From Address' contains 'youtube.com', 'facebook.com', 'twitter.com' set to "SocialMedia". If it looks like a generic newsletter (e.g., mailchimp.com, substack.com, "newsletter"), set to "Newsletter". Otherwise, set to "Gmail".
    2.  "category": Give a specific, concise category.
        - For JobPortal: "Job Alert", "Application Update", "Recruiter Message".
        - For SocialMedia: "Notification", "New Post", "Friend Request".
        - For Newsletter: "General Newsletter", "Promotional Offer", "Product Update".
        - For Gmail (general): "Meeting Request", "Invoice/Receipt", "Action Required", "Important Update", "General Inquiry", "Spam/Promotion", "Personal".
    3.  "isUrgent": boolean (true/false). True ONLY if it requires action within 24-48 hours (mentions "today", "tomorrow", "ASAP", "urgent", "deadline", "immediate").
    4.  "isImportant": boolean (true/false). True if it's from a known person/contact, a work query, a bill/financial, related to your core responsibilities, or a personal conversation. False for mass marketing/newsletters, generic notifications, or spam.
    5.  "summary": A concise, one-sentence summary of the email's main point.
    6.  "snippet": (Include the original snippet here for display purposes in UI)

    Return ONLY the JSON object. Do not include any other text.
    Ensure 'isUrgent' and 'isImportant' are always boolean.
    `;

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const parsedResult = JSON.parse(responseText);

        // Ensure source is consistently set based on analysis, fallback to Gmail
        // Ensure booleans are actually booleans
        return {
            ...parsedResult,
            source: parsedResult.source || 'Gmail',
            isUrgent: typeof parsedResult.isUrgent === 'boolean' ? parsedResult.isUrgent : false,
            isImportant: typeof parsedResult.isImportant === 'boolean' ? parsedResult.isImportant : false,
            snippet: email.snippet // Always include original snippet
        };
    } catch (error) {
        if (error.status === 429 && retries > 0) {
            let retryAfterMs = initialDelay;
            if (error.errorDetails && error.errorDetails[2] && error.errorDetails[2].retryDelay) {
                const delayString = error.errorDetails[2].retryDelay;
                const delayValue = parseFloat(delayString);
                if (!isNaN(delayValue)) {
                    retryAfterMs = delayValue * 1000;
                }
            }

            console.warn(`⚠️ Gemini API rate limit hit. Retrying in ${retryAfterMs / 1000} seconds... (${retries - 1} retries left)`);
            await new Promise(resolve => setTimeout(resolve, retryAfterMs));
            return analyzeEmail(email, retries - 1, initialDelay * 2);
        } else {
            console.error('❌ Gemini Service Error (after retries):', error);
            return {
                ...email, // Preserve original email details (from, subject, snippet, date, timestamp, type)
                source: 'Gmail', // Assume Gmail as source if AI fails for email
                category: 'AI Analysis Failed', // Specific category for display
                isUrgent: false,
                isImportant: false,
                summary: 'Could not analyze this item due to an AI service error. Defaulted to non-important/non-urgent.',
                error: error.message || 'Unknown Gemini API error',
            };
        }
    }
}

module.exports = { analyzeEmail };