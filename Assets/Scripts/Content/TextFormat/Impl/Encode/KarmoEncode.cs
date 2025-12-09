using System;
using System.IO;
using System.Text;
using UnityEngine;

namespace KarmoLab
{
	public partial class TextFormatManager : ButtonContent
	{
		public void KarmoEncode(string filePath) => KarmoEncodeDecode(filePath, decode: false);
		public void KarmoDecode(string filePath) => KarmoEncodeDecode(filePath, decode: true);
		private void KarmoEncodeDecode(string filePath, bool decode = false)
		{
			MLog.Log($"{nameof(KarmoEncodeDecode)} is called.");
			MLog.Log($"Path: {filePath}");

			if (string.IsNullOrEmpty(filePath))
			{
				MLog.Log("No text files found in the specified path.");
				return;
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

			string formattedText = string.Empty;
			string text = File.ReadAllText(filePath);

			if (decode)
			{
				string decodedText = KarmoKarmoDecode(text);
				// MLog.Log($"Decoded Text: {decodedText}");
				formattedText = decodedText;
			}
			else
			{
				string encodedText = KarmoKarmoEncode(text);
				// MLog.Log($"Encoded Text: {encodedText}");
				formattedText = encodedText;
			}

			File.WriteAllText(newFilePath, formattedText);
			MLog.Log("Formatted text has been saved.");
		}

		private const string KarmoBase64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
		private const string KarmoKarmoTable = "KARMOLBCDEFGHIJNPQSTUVWXYZabcdefghijknpqrstuvwxyz0123456789!@#$%";

		private string KarmoKarmoEncode(string input)
		{
			if (string.IsNullOrEmpty(input))
				return string.Empty;

			// 1. UTF-8 바이트로 변환
			byte[] inputBytes = Encoding.UTF8.GetBytes(input);

			// 2. 각 바이트에 XOR 연산 적용 (간단한 키 사용)
			byte xorKey = 0x4B; // 'K' (Karmo의 K)
			for (int i = 0; i < inputBytes.Length; i++)
			{
				inputBytes[i] = (byte)(inputBytes[i] ^ xorKey ^ (i % 256));
			}

			// 3. Base64 인코딩
			string base64 = Convert.ToBase64String(inputBytes);

			// 4. Base64 문자 테이블을 커스텀 테이블로 변환
			StringBuilder encoded = new(base64.Length);

			foreach (char c in base64)
			{
				if (c == '=')
				{
					encoded.Append('=');
				}
				else
				{
					int index = KarmoBase64Table.IndexOf(c);
					encoded.Append(KarmoKarmoTable[index]);
				}
			}

			return encoded.ToString();
		}

		private string KarmoKarmoDecode(string encoded)
		{
			if (string.IsNullOrEmpty(encoded))
				return string.Empty;

			// 1. 커스텀 테이블을 표준 Base64로 복원
			StringBuilder base64 = new(encoded.Length);

			foreach (char c in encoded)
			{
				if (c == '=')
				{
					base64.Append('=');
				}
				else
				{
					int index = KarmoKarmoTable.IndexOf(c);
					base64.Append(KarmoBase64Table[index]);
				}
			}

			// 2. Base64 디코딩
			byte[] decodedBytes = Convert.FromBase64String(base64.ToString());

			// 3. XOR 연산 복원 (인코딩과 동일한 연산)
			byte xorKey = 0x4B;
			for (int i = 0; i < decodedBytes.Length; i++)
			{
				decodedBytes[i] = (byte)(decodedBytes[i] ^ xorKey ^ (i % 256));
			}

			// 4. UTF-8 문자열로 변환
			return Encoding.UTF8.GetString(decodedBytes);
		}
	}
}