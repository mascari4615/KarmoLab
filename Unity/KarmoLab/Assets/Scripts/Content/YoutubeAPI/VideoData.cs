using System;

namespace KarmoLab
{
	[Serializable]
	public class VideoData
	{
		public string videoId;
		public string title;
		public string description;
		public string publishedAt;
		public string channelId;
		public string channelTitle;
		public string thumbnailUrl;

		public override string ToString()
		{
			return $"[{videoId}] {title} - {channelTitle}";
		}
	}
}