(async () => {
  const id = location.origin === "https://x.com" && location.pathname.match(/\/status\/(\d+)(?:\/|$)/)?.[1];
  if (!id) return null;

  const deadline = Date.now() + 7000;
  while (Date.now() < deadline) {
    const preview = readPreview(id);
    if (preview) return preview;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
})();

function readPreview(id) {
  // The rendered tweet keeps media metadata even when the viewer shows a content warning.
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const key = Object.keys(article).find((name) => name.startsWith("__reactFiber"));
    for (let fiber = article[key]; fiber; fiber = fiber.return) {
      const tweet = fiber.memoizedProps?.tweet;
      if (tweet?.id_str !== id) continue;
      const text = tweet.note_tweet?.note_tweet_results?.result?.text || tweet.full_text || tweet.text || "";
      const who = tweet.user ? { name: tweet.user.name || "", handle: tweet.user.screen_name || "" } : null;
      const preview = xPreviewFields(id, tweet, text, who);
      if (preview) return preview;
    }
  }
  return null;
}
