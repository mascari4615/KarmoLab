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
      const media = tweet.extended_entities?.media || tweet.entities?.media || [];
      const photos = [];
      let video = null;
      for (const item of media) {
        if (!item.media_url_https) continue;
        const w = item.original_info?.width || 0;
        const h = item.original_info?.height || 0;
        if (item.type === "photo") {
          photos.push({ url: item.media_url_https, w, h });
        } else if (!video && (item.type === "video" || item.type === "animated_gif")) {
          const variants = item.video_info?.variants || [];
          const mp4 = variants.filter((variant) => variant.content_type === "video/mp4" && variant.url)
            .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
          video = {
            poster: item.media_url_https, w, h, type: item.type,
            src: mp4?.url, durationMs: item.video_info?.duration_millis,
          };
        }
      }
      if (!(text || photos.length || video)) continue;
      return {
        id, text, photos, video, sensitive: !!tweet.possibly_sensitive,
        who: tweet.user ? { name: tweet.user.name || "", handle: tweet.user.screen_name || "" } : null,
      };
    }
  }
  return null;
}
