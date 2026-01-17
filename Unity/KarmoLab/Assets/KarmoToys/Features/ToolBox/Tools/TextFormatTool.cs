using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;
using KarmoToys.Features.ToolBox;

namespace KarmoToys.Features.ToolBox.Tools
{
	public class TextFormatTool : ITool
	{
		public string Name => "Text Formatter";

		private Action<string> _logger;

		public void Initialize(Action<string> logger)
		{
			_logger = logger;
		}

		public List<ToolAction> GetActions()
		{
			return new List<ToolAction>
			{
				new ToolAction {
					Name = "Kakao Format",
					Description = "Reformat KakaoTalk export files.",
					MainInputLabel = "File Path (Empty for Auto)",
					SubInputLabel = null,
					Execute = (main, sub) => KakaoFormat(main)
				},
				new ToolAction {
					Name = "Unique Characters",
					Description = "Extract unique characters from text.",
					MainInputLabel = "Source Text",
					SubInputLabel = null,
					Execute = (main, sub) => UniqueCharacters(main)
				},
				new ToolAction {
					Name = "Karmo Encode",
					Description = "Encode file with KarmoSpec.",
					MainInputLabel = "File Path",
					SubInputLabel = null,
					Execute = (main, sub) => KarmoEncodeDecode(main, decode: false)
				},
				new ToolAction {
					Name = "Karmo Decode",
					Description = "Decode KarmoSpec file.",
					MainInputLabel = "File Path",
					SubInputLabel = null,
					Execute = (main, sub) => KarmoEncodeDecode(main, decode: true)
				}
			};
		}

		private void Log(string msg) => _logger?.Invoke(msg);

		private void KakaoFormat(string filePath)
		{
			Log($"{nameof(KakaoFormat)} Start.");
			Log($"Path: {filePath}");

			if (string.IsNullOrEmpty(filePath))
			{
				string path = Path.GetDirectoryName(Environment.GetFolderPath(Environment.SpecialFolder.Personal));
				path = Path.Combine(path, "Downloads");
				string[] files = Directory.GetFiles(path, "KakaoTalk_*.txt");
				if (files.Length > 0)
				{
					Array.Sort(files, (x, y) => File.GetLastWriteTime(y).CompareTo(File.GetLastWriteTime(x)));
					filePath = files[0];
					Log($"Auto-selected: {filePath}");
				}
				else
				{
					Log("No KakaoTalk files found in Downloads.");
					return;
				}
			}

			filePath = filePath.Trim('"');
			if (!File.Exists(filePath)) { Log($"File not found: {filePath}"); return; }

			string folderPath = Path.GetDirectoryName(filePath);
			string fileName = Path.GetFileNameWithoutExtension(filePath);
			string fileExtension = Path.GetExtension(filePath);
			string newFilePath = Path.Combine(folderPath, $"{fileName}_formatted{fileExtension}");

			StringBuilder formattedText = new();
			string[] lines = File.ReadAllLines(filePath);

			bool isValidFile = (lines.Length > 0) && lines[0].Contains("님과 카카오톡 대화");
			if (!isValidFile) { Log("Not a valid KakaoTalk file."); return; }

			bool isMobile = (lines.Length > 0) && lines[1].Contains("저장한 날짜");
			if (isMobile) { Log("Mobile format."); MobileFormat(); }
			else { Log("PC format."); PCFormat(); }

			void MobileFormat()
			{
				// Simple Port of original logic
				lines = lines[4..];
				foreach (string line in lines)
				{
					if (string.IsNullOrWhiteSpace(line)) continue;
					string[] parts = line.Split(new[] { ',' }, 2);
					bool isChatStartLine = (parts.Length == 2) && parts[0].Contains("202");
					if (isChatStartLine)
					{
						string time = string.Empty;
						string timePart = parts[0].Trim();
						string[] timeParts = timePart.Split(" ");
						if (timeParts.Length == 5)
						{
							if (timeParts[^2] == "오후")
							{
								int hour = int.Parse(timeParts[^1].Split(':')[0]);
								if (hour != 12) hour += 12;
								time = $"{hour}:{timeParts[^1].Split(':')[1]}";
							}
							else if (timeParts[^2] == "오전")
							{
								int hour = int.Parse(timeParts[^1].Split(':')[0]);
								if (hour == 12) hour = 0;
								time = $"{hour}:{timeParts[^1].Split(':')[1]}";
							}
							else time = $"{parts[0]}";
						}
						else time = $"- {parts[0]}";

						string message = parts[1].Trim();
						int colonIndex = message.IndexOf(':');
						if (colonIndex >= 0) message = message[(colonIndex + 1)..].Trim();
						formattedText.AppendLine($"- {time} {message}");
					}
					else formattedText.AppendLine(line.Trim());
				}
				File.WriteAllText(newFilePath, formattedText.ToString());
				Log("Saved.");
			}

			void PCFormat()
			{
				string nickname = lines[0].Split(" ")[0].Trim();
				string formattedNickname = $"[{nickname}]";
				lines = lines[3..];
				for (int i = 0; i < lines.Length; i++)
				{
					string line = lines[i];
					if (string.IsNullOrWhiteSpace(line)) continue;
					string[] parts = line.Split(new[] { ']' }, 3);
					bool isChatLine = !line.StartsWith("-----");
					if (isChatLine)
					{
						bool isChatStartLine = line.Contains(formattedNickname) && (parts.Length == 3);
						if (isChatStartLine)
						{
							string time = parts[1].Trim().TrimStart('[').Trim();
							string message = parts[2].Trim();
							formattedText.AppendLine($"- {time} {message}");
						}
						else formattedText.AppendLine($"  - {line.Trim()}");
					}
					else
					{
						string datePart = line.Trim().TrimStart('-').TrimEnd('-').Trim();
						formattedText.AppendLine($"{line.Trim()}");
					}
				}
				File.WriteAllText(newFilePath, formattedText.ToString());
				Log("Saved.");
			}
		}

		private void UniqueCharacters(string text)
		{
			Log("UniqueCharacters Start.");
			if (string.IsNullOrEmpty(text)) { Log("Empty text."); return; }
			string unique = string.Concat(text.Distinct().OrderBy(c => c));
			Log($"Unique: {unique}");
		}

		private void KarmoEncodeDecode(string filePath, bool decode)
		{
			Log($"KarmoEncodeDecode. Path: {filePath}");
			if (string.IsNullOrEmpty(filePath)) return;
			filePath = filePath.Trim('"');
			if (!File.Exists(filePath)) { Log("File not found."); return; }

			string text = File.ReadAllText(filePath);
			string formattedText = decode ? KarmoKarmoDecode(text) : KarmoKarmoEncode(text);

			File.Delete(filePath);
			File.WriteAllText(filePath, formattedText); // Overwrite directly as per original logic
			Log("Processed and Saved.");
		}

		private const string KarmoBase64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		private const string KarmoKarmoTable = "KARMOLBCDEFGHIJNPQSTUVWXYZabcdefghijknpqrstuvwxyz0123456789!@#$%";

		private string KarmoKarmoEncode(string input)
		{
			if (string.IsNullOrEmpty(input)) return string.Empty;
			byte[] inputBytes = Encoding.UTF8.GetBytes(input);
			byte xorKey = 0x4B;
			for (int i = 0; i < inputBytes.Length; i++) inputBytes[i] = (byte)(inputBytes[i] ^ xorKey ^ (i % 256));
			string base64 = Convert.ToBase64String(inputBytes);
			StringBuilder encoded = new(base64.Length);
			foreach (char c in base64)
			{
				if (c == '=') encoded.Append('=');
				else
				{
					int index = KarmoBase64Table.IndexOf(c);
					if (index >= 0 && index < KarmoKarmoTable.Length) encoded.Append(KarmoKarmoTable[index]);
					else encoded.Append(c);
				}
			}
			return encoded.ToString();
		}

		private string KarmoKarmoDecode(string input)
		{
			if (string.IsNullOrEmpty(input)) return string.Empty;
			StringBuilder decodedBase64 = new(input.Length);
			foreach (char c in input)
			{
				if (c == '=') decodedBase64.Append('=');
				else
				{
					int index = KarmoKarmoTable.IndexOf(c);
					if (index >= 0 && index < KarmoBase64Table.Length) decodedBase64.Append(KarmoBase64Table[index]);
					else decodedBase64.Append(c);
				}
			}
			try
			{
				byte[] bytes = Convert.FromBase64String(decodedBase64.ToString());
				byte xorKey = 0x4B;
				for (int i = 0; i < bytes.Length; i++) bytes[i] = (byte)(bytes[i] ^ xorKey ^ (i % 256));
				return Encoding.UTF8.GetString(bytes);
			}
			catch { return "Error: Invalid format"; }
		}
	}
}
