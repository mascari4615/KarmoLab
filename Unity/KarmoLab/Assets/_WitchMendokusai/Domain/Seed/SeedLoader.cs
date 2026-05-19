using System;
using System.IO;
using UnityEngine;
using WitchMendokusai.DomainSDK.Data;
using WitchMendokusai.DomainSDK.Serialization;

namespace WitchMendokusai.Domain.Seed
{
    /// <summary>
    /// UGC 시드 로더 (게임 안 로드 + 사용).
    ///
    /// OS user data 에서 시드 JSON 로드.
    /// 시드로 게임 데이터 생성.
    /// </summary>
    public class SeedLoader : MonoBehaviour
    {
        private UGCJsonSerializer _serializer;

        private void Awake()
        {
            _serializer = new UGCJsonSerializer();
        }

        /// <summary>
        /// Load a seed from UGC storage by ID.
        ///
        /// Loads from %APPDATA%/WitchMendokusai/ugc/{ugcId}.json
        /// </summary>
        /// <param name="ugcId">The UGC ID to load.</param>
        /// <returns>Loaded SeedDataSO, or null if not found or invalid.</returns>
        public SeedDataSO LoadFromUGC(string ugcId)
        {
            if (string.IsNullOrWhiteSpace(ugcId))
            {
                Debug.LogError("ugcId cannot be empty");
                return null;
            }

            var ugcPath = GetUGCPath(ugcId);
            if (!File.Exists(ugcPath))
            {
                Debug.LogError($"Seed file not found: {ugcPath}");
                return null;
            }

            try
            {
                var json = File.ReadAllText(ugcPath);
                var seed = _serializer.Deserialize<SeedDataSO>(json);
                Debug.Log($"Loaded seed: {seed.ugcId} ({seed.parameters.name})");
                return seed;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Failed to load seed {ugcId}: {ex.Message}");
                return null;
            }
        }

        /// <summary>
        /// Apply a seed to game data.
        ///
        /// This method should be overridden or extended to implement
        /// actual procedural generation logic.
        /// </summary>
        /// <param name="seed">The seed to apply.</param>
        public void ApplySeedToGame(SeedDataSO seed)
        {
            if (seed == null)
            {
                Debug.LogError("Seed cannot be null");
                return;
            }

            if (!seed.ValidateFields(out string errorMsg))
            {
                Debug.LogError($"Seed validation failed: {errorMsg}");
                return;
            }

            // TODO: Implement actual procedural generation logic
            // For now, just log the seed info
            Debug.Log($"Applying seed: {seed.parameters.name}");
            Debug.Log($"  RNG seed: {seed.parameters.seed}");
            Debug.Log($"  Scale: {seed.parameters.scale}");
            Debug.Log($"  Description: {seed.description}");
        }

        /// <summary>
        /// Save a seed to UGC storage.
        ///
        /// Saves to %APPDATA%/WitchMendokusai/ugc/{ugcId}.json
        /// </summary>
        /// <param name="seed">The seed to save.</param>
        /// <returns>True if save was successful, false otherwise.</returns>
        public bool SaveToUGC(SeedDataSO seed)
        {
            if (seed == null)
            {
                Debug.LogError("Seed cannot be null");
                return false;
            }

            if (!seed.ValidateFields(out string errorMsg))
            {
                Debug.LogError($"Seed validation failed: {errorMsg}");
                return false;
            }

            try
            {
                var ugcPath = GetUGCPath(seed.ugcId);
                var json = _serializer.Serialize(seed);
                File.WriteAllText(ugcPath, json);
                Debug.Log($"Saved seed: {ugcPath}");
                return true;
            }
            catch (Exception ex)
            {
                Debug.LogError($"Failed to save seed: {ex.Message}");
                return false;
            }
        }

        /// <summary>
        /// Get the full path to a UGC file.
        /// </summary>
        private string GetUGCPath(string ugcId)
        {
            var appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            var ugcDir = Path.Combine(appData, "WitchMendokusai", "ugc");

            // Ensure directory exists
            Directory.CreateDirectory(ugcDir);

            return Path.Combine(ugcDir, $"{ugcId}.json");
        }
    }
}
