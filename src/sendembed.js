// utils/discordWebhook.js
export async function sendDiscordEmbed(webhookUrl, { title, description, color = 0x5865F2 }) {
  const embed = {
    title,
    description,
    color, // integer hex color, e.g. 0xff0000 for red
    timestamp: new Date().toISOString(),
  };

  const payload = {
    embeds: [embed],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to send Discord webhook: ${res.status} ${text}`);
  }
}
