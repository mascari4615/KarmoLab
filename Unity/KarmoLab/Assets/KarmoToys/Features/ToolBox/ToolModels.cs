using System;
using System.Collections.Generic;

namespace KarmoToys.Features.ToolBox
{
	public class ToolAction
	{
		public string Name { get; set; }
		public string Description { get; set; }
		public string MainInputLabel { get; set; } = "Main Input";
		public string SubInputLabel { get; set; }
		public Action<string, string> Execute { get; set; }
	}

	public interface ITool
	{
		string Name { get; }
		void Initialize(Action<string> logger);
		List<ToolAction> GetActions();
	}
}
