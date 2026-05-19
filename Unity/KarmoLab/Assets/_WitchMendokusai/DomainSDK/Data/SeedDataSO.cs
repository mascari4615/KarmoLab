using UnityEngine;
using System;

namespace WitchMendokusai.DomainSDK.Data
{
    /// <summary>
    /// 시드 데이터 (UGC first-use).
    ///
    /// Procedural generation seed 저장 (가장 단순).
    /// DomainSDK 확장 (추가 필드 최소).
    /// </summary>
    public class SeedDataSO : UGCDataSO
    {
        [System.Serializable]
        public class SeedParameters
        {
            /// <summary>
            /// RNG seed for procedural generation.
            /// </summary>
            public int seed;

            /// <summary>
            /// Name of the seed.
            /// </summary>
            public string name;

            /// <summary>
            /// Scale factor for terrain/world generation (example).
            /// </summary>
            public float scale = 1.0f;
        }

        /// <summary>
        /// Parameters for procedural generation.
        /// </summary>
        public SeedParameters parameters;

        /// <summary>
        /// Human-readable description of the seed.
        /// </summary>
        public string description;

        public override bool ValidateFields(out string errorMessage)
        {
            // Validate base fields first
            if (!base.ValidateFields(out errorMessage))
                return false;

            // Validate SeedDataSO-specific fields
            if (parameters == null)
            {
                errorMessage = "parameters cannot be null";
                return false;
            }

            if (string.IsNullOrWhiteSpace(parameters.name))
            {
                errorMessage = "parameters.name cannot be empty";
                return false;
            }

            if (parameters.seed < 0)
            {
                errorMessage = "parameters.seed cannot be negative";
                return false;
            }

            if (parameters.scale <= 0)
            {
                errorMessage = "parameters.scale must be positive";
                return false;
            }

            return true;
        }
    }
}
