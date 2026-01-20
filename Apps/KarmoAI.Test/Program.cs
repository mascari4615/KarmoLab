using Microsoft.Extensions.Configuration;
using KarmoAI.Services;
using KarmoAI.Models;
using System.Threading.Tasks;

namespace KarmoAI.Test
{
    class Program
    {
        static async Task Main(string[] args)
        {
            Console.WriteLine("=== KarmoAI Service Test ===");

            // 구성 작성 (User Secrets + 환경 변수 결합)
            var config = new ConfigurationBuilder()
                .AddUserSecrets<Program>()
                .AddEnvironmentVariables()
                .Build();

            // 2. 설정 값 읽기
            string? apiKey = config["GEMINI_API_KEY"];
            string modelName = config["GEMINI_MODEL"] ?? "gemini-1.5-flash";

            if (string.IsNullOrEmpty(apiKey))
            {
                Console.WriteLine("Error: GEMINI_API_KEY is not set.");
                Console.WriteLine("Please set it via 'dotnet user-secrets set GEMINI_API_KEY \"your_key\"' or OS environment variable.");
                return;
            }

            var service = new GeminiService(apiKey, modelName);

            Console.WriteLine("\n[TC1: Simple Prompt]");
            string prompt = "Hello, who are you?";
            Console.WriteLine($"Prompt: {prompt}");
            try 
            {
                var response = await service.GetResponseAsync(prompt);
                Console.WriteLine($"Response: {response}");
            }
            catch (Exception ex)
            {
                Console.WriteLine($">> TC1 Failed: {ex.Message}");
                Console.WriteLine(">> Diagnostic: Listing accessible models for your API key...");
                var models = await service.ListModelsAsync();
                Console.WriteLine($">> Available Models: {models}");
                return; // 진단 정보를 보여준 후 종료
            }

            Console.WriteLine("\n[TC2: Structured Output (JSON)]");
            string jsonPrompt = "Generate a fake profile for a futuristic robot. Include Name, Role, and PowerLevel.";
            Console.WriteLine($"Prompt: {jsonPrompt}");
            
            var profile = await service.GetStructuredResponseAsync<RobotProfile>(jsonPrompt);
            if (profile != null)
            {
                Console.WriteLine($">> Parsed Success: Name={profile.Name}, Role={profile.Role}, PowerLevel={profile.PowerLevel}");
            }
            else
            {
                Console.WriteLine(">> Failed to parse structured response.");
            }

            Console.WriteLine("\n[TC3: System Instruction Test (Cat Persona)]");
            string systemCat = "너는 고양이야. 모든 문장 끝에 '냥'을 붙여서 대답해.";
            string userQuery = "너는 누구니?";
            Console.WriteLine($"System: {systemCat}");
            Console.WriteLine($"User: {userQuery}");
            var catResponse = await service.GetResponseAsync(userQuery, systemCat);
            Console.WriteLine($"Response: {catResponse}");

            Console.WriteLine("\n=== Test Completed ===");
        }
    }

    public class RobotProfile
    {
        public string Name { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public double PowerLevel { get; set; }
    }
}
