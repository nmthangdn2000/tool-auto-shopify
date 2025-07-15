export const promptFinal = (prompt: string) => `
${prompt}

🚨 IMPORTANT INSTRUCTION:
Return your response **as raw JSON only** — no markdown, no backticks, no HTML tags, no explanations, no formatting. Just a valid, plain JSON object.
✅ Return your response strictly as a code JSON object.
- The object must include at least the key \`title\` (string).
- All other keys and values are optional and flexible — use any key names and value types you find appropriate.
- Do NOT wrap the JSON in code blocks or explanation text.

Example format JSON:
{
  "title": "SEO-optimized title here",
  "customKey1": "any value",
  "customList": ["item1", "item2"],
  "note": "this is optional",
  ...
}
And you must show me a maximum of 4 relevant images from this article, no images that look like the logo.`;
