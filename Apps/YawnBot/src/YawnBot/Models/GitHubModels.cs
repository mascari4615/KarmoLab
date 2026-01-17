using System.Collections.Generic;

namespace KarmoLab.YawnBot.Models
{
	public class GitHubPayload
	{
		public string action { get; set; } = string.Empty;
		public GitHubRepository repository { get; set; } = new();
		public GitHubSender sender { get; set; } = new();
		public GitHubIssue? issue { get; set; }
		public GitHubPullRequest? pull_request { get; set; }
		public List<GitHubCommit>? commits { get; set; }
	}

	public class GitHubRepository
	{
		public string name { get; set; } = string.Empty;
		public string full_name { get; set; } = string.Empty;
		public string html_url { get; set; } = string.Empty;
	}

	public class GitHubSender
	{
		public string login { get; set; } = string.Empty;
		public string avatar_url { get; set; } = string.Empty;
	}

	public class GitHubIssue
	{
		public int number { get; set; }
		public string title { get; set; } = string.Empty;
		public string html_url { get; set; } = string.Empty;
		public string body { get; set; } = string.Empty;
	}

	public class GitHubPullRequest
	{
		public int number { get; set; }
		public string title { get; set; } = string.Empty;
		public string html_url { get; set; } = string.Empty;
	}

	public class GitHubCommit
	{
		public string id { get; set; } = string.Empty;
		public string message { get; set; } = string.Empty;
		public string url { get; set; } = string.Empty;
	}
}
