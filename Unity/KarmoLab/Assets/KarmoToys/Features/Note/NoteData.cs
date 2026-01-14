using System;
using System.Collections.Generic;

namespace KarmoToys.Features.Note
{
	[Serializable]
	public class SecretNote
	{
		public string Id;
		public string DateString;
		public string Problem;
		public string Why;
		public string Solution;

		public SecretNote(string problem, string why, string solution)
		{
			Id = Guid.NewGuid().ToString();
			DateString = DateTime.Now.ToString("yyyy-MM-dd");
			Problem = problem;
			Why = why;
			Solution = solution;
		}
	}

	[Serializable]
	public class NoteData
	{
		public List<SecretNote> SecretNotes = new List<SecretNote>();
	}
}
