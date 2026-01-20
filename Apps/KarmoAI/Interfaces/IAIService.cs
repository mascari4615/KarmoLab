using System.Threading.Tasks;

namespace KarmoAI.Interfaces
{
    /// <summary>
    /// AI 서비스와의 상호작용을 정의하는 인터페이스.
    /// </summary>
    public interface IAIService
    {
        /// <summary>
        /// 텍스트 프롬프트를 보내고 응답을 받습니다.
        /// </summary>
        /// <param name="prompt">입력 프롬프트</param>
        /// <param name="systemInstruction">시스템 지침 (선택 사항)</param>
        /// <returns>AI 응답 텍스트</returns>
        Task<string> GetResponseAsync(string prompt, string? systemInstruction = null);

        /// <summary>
        /// 구조화된 응답(JSON 등)을 받습니다.
        /// </summary>
        /// <typeparam name="T">응답 객체 타입</typeparam>
        /// <param name="prompt">입력 프롬프트</param>
        /// <param name="systemInstruction">시스템 지침 (선택 사항)</param>
        /// <returns>파싱된 응답 객체</returns>
        Task<T?> GetStructuredResponseAsync<T>(string prompt, string? systemInstruction = null) where T : class;
    }
}
