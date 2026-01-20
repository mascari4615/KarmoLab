using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using KarmoAI.Interfaces;
using Mscc.GenerativeAI;
using Mscc.GenerativeAI.Types;

namespace KarmoAI.Services
{
    /// <summary>
    /// Google Gemini API를 사용하여 텍스트 생성 및 구조화된 응답(JSON)을 제공하는 서비스입니다.
    /// </summary>
    public class GeminiService : IAIService
    {
        private readonly string _apiKey;
        private readonly string _primaryModelName;
        private readonly GoogleAI _googleAI;

        /// <summary>
        /// 우선순위별 폴백 모델 리스트 (Flash 계열을 우선적으로 시도)
        /// </summary>
        private readonly string[] _fallbackModels = {
            "gemini-flash-latest",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite",
            "gemini-pro-latest"
        };

        public GeminiService(string apiKey, string modelName = "gemini-1.5-flash")
        {
            _apiKey = apiKey ?? throw new ArgumentNullException(nameof(apiKey));
            _primaryModelName = modelName;
            _googleAI = new GoogleAI(_apiKey, ApiVersion.V1); 
        }

        public async Task<string> ListModelsAsync()
        {
            try 
            {
                var model = _googleAI.GenerativeModel();
                var models = await model.ListModels();
                return string.Join(", ", models.Select(m => m.Name));
            }
            catch (Exception ex)
            {
                return $"Error listing models: {ex.Message}";
            }
        }

        public async Task<string> GetResponseAsync(string prompt, string? systemInstruction = null)
        {
            return await ExecuteWithFallbackAsync(async (modelName) =>
            {
                var model = _googleAI.GenerativeModel(modelName);
                var request = new GenerateContentRequest(prompt);
                
                if (!string.IsNullOrEmpty(systemInstruction))
                {
                    request.SystemInstruction = new Content
                    {
                        Role = Role.System,
                        Parts = new System.Collections.Generic.List<IPart> { new TextData { Text = systemInstruction } }
                    };
                }
                
                var response = await model.GenerateContent(request);
                return response.Text ?? string.Empty;
            });
        }

        public async Task<T?> GetStructuredResponseAsync<T>(string prompt, string? systemInstruction = null) where T : class
        {
            var text = await ExecuteWithFallbackAsync(async (modelName) =>
            {
                var model = _googleAI.GenerativeModel(modelName);
                model.UseJsonMode = true;

                var request = new GenerateContentRequest(prompt);
                if (!string.IsNullOrEmpty(systemInstruction))
                {
                    request.SystemInstruction = new Content
                    {
                        Role = Role.System,
                        Parts = new System.Collections.Generic.List<IPart> { new TextData { Text = systemInstruction } }
                    };
                }
                
                var enhancedPrompt = $"{prompt}\n\nIMPORTANT: Return ONLY a valid JSON object matching the required schema.";
                
                if (request.Contents != null && request.Contents.Count > 0 && request.Contents[0].Parts != null && request.Contents[0].Parts.Count > 0)
                {
                    request.Contents[0].Parts[0] = new TextData { Text = enhancedPrompt };
                }
                
                var response = await model.GenerateContent(request);
                return response.Text ?? string.Empty;
            });

            if (string.IsNullOrEmpty(text)) return null;

            try
            {
                string json = text.Trim();
                if (json.Contains("```"))
                {
                    var startIndex = json.IndexOf("```") + 3;
                    if (json.Length > startIndex + 4 && json.Substring(startIndex, 4).ToLower() == "json") startIndex += 4;
                    var endIndex = json.LastIndexOf("```");
                    if (endIndex > startIndex)
                    {
                        json = json.Substring(startIndex, endIndex - startIndex).Trim();
                    }
                }

                return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    AllowTrailingCommas = true,
                    ReadCommentHandling = JsonCommentHandling.Skip
                });
            }
            catch (JsonException)
            {
                return null;
            }
        }

        /// <summary>
        /// 모델 실패 시 폴백 리스트를 순회하며 재시도하는 공통 헬퍼 메서드
        /// </summary>
        private async Task<string> ExecuteWithFallbackAsync(Func<string, Task<string>> action)
        {
            var modelsToTry = new System.Collections.Generic.List<string> { _primaryModelName };
            foreach (var m in _fallbackModels)
            {
                if (m != _primaryModelName) modelsToTry.Add(m);
            }

            var errors = new System.Collections.Generic.List<string>();

            foreach (var modelName in modelsToTry)
            {
                try
                {
                    Console.WriteLine($">> Trying model: {modelName}...");
                    var task = action(modelName);
                    if (await Task.WhenAny(task, Task.Delay(30000)) == task)
                    {
                        return await task;
                    }
                    else
                    {
                        throw new TimeoutException($"Model '{modelName}' timed out after 30 seconds.");
                    }
                }
                catch (Exception ex)
                {
                    var errMsg = ex.Message;
                    Console.WriteLine($">> Model '{modelName}' failed. (Error: {errMsg.Split('\n')[0]})");
                    errors.Add($"{modelName}: {errMsg}");
                    
                    // 429, 404, Timeout 등 모든 예러에 대해 폴백 시도
                    continue;
                }
            }

            throw new Exception($"All models failed to respond. Errors:\n{string.Join("\n", errors)}");
        }
    }
}
