function xPreviewFields(id, tweet, text, who) {
  const photos = [];
  let video = null;
  for (const item of tweet?.extended_entities?.media || tweet?.entities?.media || []) {
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
  return text || photos.length || video
    ? { id, text, photos, video, who, sensitive: !!tweet?.possibly_sensitive }
    : null;
}
