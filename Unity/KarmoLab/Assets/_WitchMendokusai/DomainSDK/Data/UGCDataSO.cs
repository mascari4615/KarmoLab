using UnityEngine;
using System;

namespace WitchMendokusai.DomainSDK.Data
{
    /// <summary>
    /// UGC 데이터 기본 구조 (모든 UGC 가 상속).
    ///
    /// JSON 외부화 가능한 필드만 포함.
    /// DataSO 구조 (Unity 직렬화 호환).
    ///
    /// Subclass (SeedDataSO 등) 가 구체 필드 추가 시,
    /// DomainSDK schema 정의 필드만 허용.
    /// </summary>
    public abstract class UGCDataSO : ScriptableObject
    {
        /// <summary>
        /// Unique identifier for this UGC object.
        /// </summary>
        public string ugcId;

        /// <summary>
        /// User who created this UGC object.
        /// </summary>
        public string createdBy;

        /// <summary>
        /// Timestamp when this UGC object was created (ISO 8601 format).
        /// </summary>
        public DateTime createdAt;

        /// <summary>
        /// Virtual method for subclasses to validate their fields.
        /// Override in subclasses to add custom validation.
        /// </summary>
        public virtual bool ValidateFields(out string errorMessage)
        {
            errorMessage = string.Empty;

            if (string.IsNullOrWhiteSpace(ugcId))
            {
                errorMessage = "ugcId cannot be empty";
                return false;
            }

            if (string.IsNullOrWhiteSpace(createdBy))
            {
                errorMessage = "createdBy cannot be empty";
                return false;
            }

            if (createdAt == default)
            {
                errorMessage = "createdAt must be set";
                return false;
            }

            return true;
        }
    }
}
