export const prompt = (
  url: string,
) => `🎯 GENERAL REUSABLE PROMPT (JSON OUTPUT VERSION)
Write me a complete SEO Blog Pack for the topic from url blog: ${url} 

Requirements:
1️⃣ Create an engaging, SEO-friendly title that clearly includes the main keyword.
2️⃣ Provide a comma-separated keyword list, 15–30 realistic related keywords.
3️⃣ Add a short explanation of why these keywords are effective, mentioning search intent and reader context.
4️⃣ Suggest a logical outline (section headings) for a blog post of about 800–1500 words — clear, easy to follow.
5️⃣ Use a friendly, practical tone, helpful for beginners but valuable for intermediate readers too.
6️⃣ Find and include at least 4 relevant image URLs for the blog post.

✅ For image URLs:
🔹 First, try to extract real image URLs from this blog: [BLOG URL HERE — e.g. ${url}]
🔹 If there are not enough images on the page, find similar relevant images from other real gardening or farming-related websites (not placeholder or stock image links).
🔹 All images **must be accessible via a direct URL and suitable for use in a blog**.

✅ Return your response strictly as a JSON object using the following structure:
{
  "title": "string - SEO optimized title including main keyword",
  "keywords": ["keyword1", "keyword2", "..."],
  "whyTheseKeywordsWork": "string - explanation of search intent and keyword relevance",
  "suggestedBlogSections": [
    "section 1 title",
    "section 2 title",
    "section 3 title",
    "... up to 10–15 sections"
  ]
}
And you must show me a maximum of 4 relevant images from this article, no images that look like the logo.`;
