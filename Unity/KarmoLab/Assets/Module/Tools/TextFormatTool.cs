using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using UnityEngine;

namespace KarmoLab.Module.Tools
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
                    Description = "카카오톡 대화 내보내기 텍스트 파일을 보기 좋게 정리합니다. (PC/Mobile 포맷 자동 감지)",
                    MainInputLabel = "File Path (빈 칸이면 다운로드 폴더 자동 검색)",
                    SubInputLabel = null,
                    Execute = (main, sub) => KakaoFormat(main)
                },
                new ToolAction {
                    Name = "Unique Characters",
                    Description = "텍스트에서 중복된 문자를 제거하고 사용된 고유 문자만 정렬하여 출력합니다.",
                    MainInputLabel = "Source Text",
                    SubInputLabel = null,
                    Execute = (main, sub) => UniqueCharacters(main)
                },
                new ToolAction {
                    Name = "Karmo Encode",
                    Description = "텍스트를 KarmoLab 독자 규격으로 인코딩하여 파일로 저장합니다.",
                    MainInputLabel = "File Path",
                    SubInputLabel = null,
                    Execute = (main, sub) => KarmoEncodeDecode(main, decode: false)
                },
                new ToolAction {
                    Name = "Karmo Decode",
                    Description = "KarmoLab 규격으로 인코딩된 파일을 다시 평문으로 복호화합니다.",
                    MainInputLabel = "File Path",
                    SubInputLabel = null,
                    Execute = (main, sub) => KarmoEncodeDecode(main, decode: true)
                }
            };
        }

        private void Log(string msg) => _logger?.Invoke(msg);

        // --- Logic from KakaoFormat.cs ---
        private void KakaoFormat(string filePath)
        {
            Log($"{nameof(KakaoFormat)} is called.");
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
                    Log($"Using the most recent file: {filePath}");
                }
                else
                {
                    Log("No KakaoTalk text files found in the Downloads folder.");
                    return;
                }
            }

            filePath = filePath.Trim('"');

            if (!File.Exists(filePath))
            {
                Log($"The provided file path does not exist: {filePath}");
                return;
            }

            string folderPath = Path.GetDirectoryName(filePath);
            string fileName = Path.GetFileNameWithoutExtension(filePath);
            string fileExtension = Path.GetExtension(filePath);
            string newFilePath = Path.Combine(folderPath, $"{fileName}_formatted{fileExtension}");

            StringBuilder formattedText = new();
            string[] lines = File.ReadAllLines(filePath);

            bool isValidFile = (lines.Length > 0) && lines[0].Contains("님과 카카오톡 대화");

            if (!isValidFile)
            {
                Log("The provided file is not a valid KakaoTalk chat file.");
                return;
            }

            bool isMobile = (lines.Length > 0) && lines[1].Contains("년");

            if (isMobile)
            {
                Log("Mobile format detected.");
                MobileFormat();
            }
            else
            {
                Log("PC format detected.");
                PCFormat();
            }

            void MobileFormat()
            {
                lines = lines[4..];

                foreach (string line in lines)
                {
                    if (string.IsNullOrWhiteSpace(line)) continue;

                    string[] parts = line.Split(new[] { ',' }, 2);

                    bool isChatStartLine = (parts.Length == 2) && parts[0].Contains("202");
                    if (isChatStartLine)
                    {
                        string time = string.Empty;
						{
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
								else
								{
									time = $"{parts[0]}"; 
								}
							}
							else
							{
								time = $"- {parts[0]}"; 
							}
						}

                        string message = parts[1].Trim();
                        int colonIndex = message.IndexOf(':');
                        if (colonIndex >= 0)
                            message = message[(colonIndex + 1)..].Trim();

                        formattedText.AppendLine($"- {time} {message}");
                    }
                    else
                    {
                        formattedText.AppendLine(line.Trim());
                    }
                }
                File.WriteAllText(newFilePath, formattedText.ToString());
                Log("Formatted text has been saved.");
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
                        else
                        {
                            formattedText.AppendLine($"  - {line.Trim()}");
                        }
                    }
                    else
                    {
                        string datePart = line.Trim().TrimStart('-').TrimEnd('-').Trim();
                        string[] dateParts = datePart.Split(' ');

                        if (dateParts.Length >= 3)
                        {
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
                Log("Formatted text has been saved.");
            }
        }

        // --- Logic from UniqueCharacters.cs ---
        private void UniqueCharacters(string text)
        {
            Log($"{nameof(UniqueCharacters)} is called.");
            if (string.IsNullOrEmpty(text))
            {
                Log("Input text is empty.");
                return;
            }

            string unique = string.Concat(text.Distinct().OrderBy(c => c));
            Log($"Unique Characters: {unique}");
            // Since OutputField is readonly and used for logs, maybe we just log it?
            // Or we can assume the tool can output results to the log.
        }

        // --- Logic from KarmoEncode.cs ---
        private void KarmoEncodeDecode(string filePath, bool decode)
        {
            Log($"{nameof(KarmoEncodeDecode)} is called.");
            Log($"Path: {filePath}");

            if (string.IsNullOrEmpty(filePath))
            {
                Log("No text files found or path empty.");
                return;
            }

            filePath = filePath.Trim('"');

            if (!File.Exists(filePath))
            {
                // Is it raw text or file path? Old logic assumed file path.
                // But users might put raw text in InputMain?
                // The original logic checks File.Exists(filePath). 
                // If the user inputs raw text that is not a path, what happens?
                // For now, let's assume it supports Raw Text mode too if file not found?
                // But the original code returns. I will stick to original logic.
                Log($"The provided file path does not exist: {filePath}");
                return;
            }

            string folderPath = Path.GetDirectoryName(filePath);
            string fileName = Path.GetFileNameWithoutExtension(filePath);
            string fileExtension = Path.GetExtension(filePath);
            string newFilePath = Path.Combine(folderPath, $"{fileName}_formatted{fileExtension}");

            string text = File.ReadAllText(filePath);
            string formattedText = decode ? KarmoKarmoDecode(text) : KarmoKarmoEncode(text);

            // Override file logic
            File.Delete(filePath);
            newFilePath = filePath;

            File.WriteAllText(newFilePath, formattedText);
            Log("Formatted text has been saved.");
        }

        private const string KarmoBase64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        private const string KarmoKarmoTable = "KARMOLBCDEFGHIJNPQSTUVWXYZabcdefghijknpqrstuvwxyz0123456789!@#$%";

        private string KarmoKarmoEncode(string input)
        {
            if (string.IsNullOrEmpty(input)) return string.Empty;

            byte[] inputBytes = Encoding.UTF8.GetBytes(input);
            byte xorKey = 0x4B; 
            for (int i = 0; i < inputBytes.Length; i++)
            {
                inputBytes[i] = (byte)(inputBytes[i] ^ xorKey ^ (i % 256));
            }

            string base64 = Convert.ToBase64String(inputBytes);
            StringBuilder encoded = new(base64.Length);

            foreach (char c in base64)
            {
                if (c == '=') encoded.Append('=');
                else
                {
                    int index = KarmoBase64Table.IndexOf(c);
                    if (index >= 0 && index < KarmoKarmoTable.Length)
                        encoded.Append(KarmoKarmoTable[index]);
                    else
                        encoded.Append(c);
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
                    if (index >= 0 && index < KarmoBase64Table.Length)
                        decodedBase64.Append(KarmoBase64Table[index]);
                    else
                        decodedBase64.Append(c);
                }
            }

            try
            {
                byte[] bytes = Convert.FromBase64String(decodedBase64.ToString());
                byte xorKey = 0x4B;
                for (int i = 0; i < bytes.Length; i++)
                {
                    bytes[i] = (byte)(bytes[i] ^ xorKey ^ (i % 256));
                }
                return Encoding.UTF8.GetString(bytes);
            }
            catch
            {
                return "Error: Invalid format";
            }
        }
    }
}
