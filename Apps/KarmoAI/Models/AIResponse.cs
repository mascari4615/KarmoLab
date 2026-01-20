namespace KarmoAI.Models
{
    /// <summary>
    /// AI 서비스의 공통 응답 모델.
    /// </summary>
    public class AIResponse<T>
    {
        public bool IsSuccess { get; set; }
        public T? Data { get; set; }
        public string? RawResponse { get; set; }
        public string? ErrorMessage { get; set; }
    }
}
