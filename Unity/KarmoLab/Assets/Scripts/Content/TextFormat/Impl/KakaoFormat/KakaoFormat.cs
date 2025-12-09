using System;
using System.IO;
using System.Text;
using UnityEngine;

namespace KarmoLab
{
	public partial class TextFormatManager : ButtonContent
	{
		// KakaoTalk 대화 Text를 내가 원하는 Format으로
		public void KakaoFormat(string filePath)
		{
			MLog.Log($"{nameof(KakaoFormat)} is called.");
			MLog.Log($"Path: {filePath}");

			if (string.IsNullOrEmpty(filePath))
			{
				// C:\Users\masca\Downloads\KakaoTalk_*.txt
				string path = Path.GetDirectoryName(Environment.GetFolderPath(Environment.SpecialFolder.Personal));
				path = Path.Combine(path, "Downloads");

				// 경로 중에서 KakaoTalk_*.txt 파일을 찾습니다.
				string[] files = Directory.GetFiles(path, "KakaoTalk_*.txt");

				// 가장 최근 파일을 선택합니다.
				if (files.Length > 0)
				{
					Array.Sort(files, (x, y) => File.GetLastWriteTime(y).CompareTo(File.GetLastWriteTime(x)));
					filePath = files[0];
					MLog.Log($"Using the most recent file: {filePath}");
				}
				else
				{
					MLog.Log("No KakaoTalk text files found in the Downloads folder.");
					return;
				}
			}

			filePath = filePath.Trim('"');

			if (File.Exists(filePath) == false)
			{
				MLog.Log($"The provided file path does not exist: {filePath}");
				return;
			}

			string folderPath = Path.GetDirectoryName(filePath);
			string fileName = Path.GetFileNameWithoutExtension(filePath);
			string fileExtension = Path.GetExtension(filePath);
			string newFilePath = Path.Combine(folderPath, $"{fileName}_formatted{fileExtension}");

			StringBuilder formattedText = new();
			string[] lines = File.ReadAllLines(filePath);

			bool isValidFile = (lines.Length > 0) && lines[0].Contains("님과 카카오톡 대화");

			if (isValidFile == false)
			{
				MLog.Log("The provided file is not a valid KakaoTalk chat file.");
				return;
			}

			// 모바일과 PC의 KakaoTalk 대화 형식이 다르기 때문에, 구분합니다.
			// 모바일은 '2025년 3월 26일 오후 12:27' 형식으로 시작합니다.
			// PC는 '2025.03.26 오후 12:27' 형식으로 시작합니다.
			bool isMobile = (lines.Length > 0) && lines[1].Contains("년");

			if (isMobile)
			{
				MLog.Log("Mobile format detected.");
				MobileFormat();
			}
			else
			{
				MLog.Log("PC format detected.");
				PCFormat();
			}

			// 모바일 텍스트 형식
			void MobileFormat()
			{
				// 앞에 4줄은 제외
				lines = lines[4..];

				foreach (string line in lines)
				{
					// 라인이 비어있거나 공백으로만 이루어진 경우는 건너뜁니다.
					if (string.IsNullOrWhiteSpace(line))
					{
						continue;
					}

					// 첫 번째 ','를 기준으로 나눕니다.
					string[] parts = line.Split(new[] { ',' }, 2);

					bool isChatStartLine = (parts.Length == 2) && parts[0].Contains("202");
					// timePart가 '202@년'를 포함하는지 확인,
					// 대화 내용 중 줄바꿈한 Line에 쉼표가 들어간 경우도 있어서.
					if (isChatStartLine)
					{
						string time = string.Empty;
						{
							// 2025년 3월 26일 오후 12:27
							// ->
							// - 12:27

							string timePart = parts[0].Trim();
							string[] timeParts = timePart.Split(" ");

							if (timeParts.Length == 5)
							{
								// 오전/오후를 12시간제로 변환
								if (timeParts[^2] == "오후")
								{
									int hour = int.Parse(timeParts[^1].Split(':')[0]);
									if (hour != 12)
									{
										hour += 12; // 오후는 12를 더합니다.
									}
									time = $"{hour}:{timeParts[^1].Split(':')[1]}";
								}
								else if (timeParts[^2] == "오전")
								{
									int hour = int.Parse(timeParts[^1].Split(':')[0]);
									if (hour == 12)
									{
										hour = 0; // 오전 12시는 자정이므로 0으로 설정합니다.
									}
									time = $"{hour}:{timeParts[^1].Split(':')[1]}";
								}
								else
								{
									MLog.Log($"Invalid time format: {parts[0]}");
									time = $"{parts[0]}"; // Fallback to original time string
								}
							}
							else
							{
								MLog.Log($"Invalid time format: {parts[0]}");
								time = $"- {parts[0]}"; // Fallback to original time string
							}
						}

						string message = parts[1].Trim();
						{
							//  김도윤 : 아름드리
							// ->
							// 아름드리

							// ':'가 있는 경우, ':' 이후의 내용을 가져옵니다.
							int colonIndex = message.IndexOf(':');
							message = message[(colonIndex + 1)..].Trim(); // ':' 이후의 내용을 가져옵니다.
						}

						formattedText.AppendLine($"- {time} {message}");
					}
					else
					{
						// ':'가 없는 경우, 원본 라인을 그대로 추가합니다.
						formattedText.AppendLine(line.Trim());
					}
				}

				File.WriteAllText(newFilePath, formattedText.ToString());
				MLog.Log("Formatted text has been saved.");

			}

			// PC 텍스트 형식으로 변환
			void PCFormat()
			{
				// "김도윤 님과 카카오톡 대화" -> "김도윤"
				// 첫 번째 줄에서 닉네임 불러오기
				string nickname = lines[0].Split(" ")[0].Trim();
				string formattedNickname = $"[{nickname}]";

				// 앞에 3줄은 제외
				lines = lines[3..];

				// foreach (string line in lines)
				for (int i = 0; i < lines.Length; i++)
				{
					string line = lines[i];

					// 라인이 비어있거나 공백으로만 이루어진 경우는 건너뜁니다.
					if (string.IsNullOrWhiteSpace(line))
					{
						continue;
					}

					// "[김도윤] [07:28] Test" -> { "[김도윤", " [07:28", " Test" }
					// ']'를 기준으로 세 조각으로 나눕니다.
					string[] parts = line.Split(new[] { ']' }, 3);

					bool isChatLine = line.StartsWith("-----") == false;
					if (isChatLine)
					{
						bool isChatStartLine = line.Contains(formattedNickname) && (parts.Length == 3); // 말풍선 시작 라인인지 확인

						if (isChatStartLine)
						{
							string time;
							{
								// " [07:28" -> "07:28"
								time = parts[1].Trim().TrimStart('[').Trim();
							}

							string message;
							{
								// " Test" -> "Test"
								message = parts[2].Trim();
							}

							formattedText.AppendLine($"- {time} {message}");
						}
						else
						{
							// 말풍선이 아닌 경우, 즉 대화 내용 중 줄바꿈한 Line
							formattedText.AppendLine($"  - {line.Trim()}");
						}
					}
					else
					{
						// "--------------- 25년 4월 21일 월요일 ---------------" -> "## 21: 카카오"

						string datePart = line.Trim().TrimStart('-').TrimEnd('-').Trim();
						string[] dateParts = datePart.Split(' ');

						if (dateParts.Length >= 3)
						{
							// "25년 4월 21일" -> "21: 카카오"
							string day = dateParts[2].TrimEnd('일');
							formattedText.AppendLine($"## {day}: 카카오");
						}
						else
						{
							formattedText.AppendLine($"{line.Trim()}");
						}
					}
				}

				File.WriteAllText(newFilePath, formattedText.ToString());
				MLog.Log("Formatted text has been saved.");
			}
		}
	}
}