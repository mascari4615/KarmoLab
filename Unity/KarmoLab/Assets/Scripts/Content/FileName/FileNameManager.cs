using UnityEngine;
using System;
using System.Collections.Generic;

namespace KarmoLab
{
	public partial class FileNameManager : ButtonContent
	{
		public const string TEMP_PATH = "TEMP_PATH";

		protected override Dictionary<int, (Delegate function, string functionName)> InitializeFunctionMap()
		{
			return new Dictionary<int, (Delegate function, string functionName)>
			{
				{ 1, ((FunctionWithMainInput)ChangeWinScreenshotName, nameof(ChangeWinScreenshotName)) },
				{ 2, ((FunctionWithMainInput)ChangeVRCScreenshotName, nameof(ChangeVRCScreenshotName)) },
				{ 3, ((FunctionWithTwoInputs)RemoveSomeString, nameof(RemoveSomeString)) },
				{ 4, ((FunctionWithMainInput)KarmoRegex.Func4, nameof(KarmoRegex.Func4)) },
				{ 5, ((FunctionWithTwoInputs)FileNameToString, nameof(FileNameToString)) },
				{ 6, ((FunctionWithTwoInputs)ChangeNameToDate, nameof(ChangeNameToDate)) },
				{ 7, ((FunctionWithTwoInputs)ModSubIndex, nameof(ModSubIndex)) },
				{ 8, ((FunctionWithTwoInputs)ConvertCase, nameof(ConvertCase))},
				{ 9, ((FunctionWithTwoInputs)ConvertString, nameof(ConvertString))},
			};
		}
	}
}