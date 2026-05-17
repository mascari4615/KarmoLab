using NUnit.Framework;
using UnityEngine;
using WitchMendokusai.DomainSDK.Data;
using WitchMendokusai.DomainSDK.Serialization;
using System;

namespace WitchMendokusai.Tests.DomainSDK
{
    /// <summary>
    /// Unit tests for UGC serialization (Phase A-C validation).
    /// </summary>
    public class UGCSerializationTests
    {
        private UGCJsonSerializer _serializer;
        private SeedDataSO _testSeed;

        [SetUp]
        public void Setup()
        {
            _serializer = new UGCJsonSerializer();

            // Create a test seed
            _testSeed = ScriptableObject.CreateInstance<SeedDataSO>();
            _testSeed.ugcId = "test-seed-001";
            _testSeed.createdBy = "test-player";
            _testSeed.createdAt = new DateTime(2026, 5, 17, 12, 0, 0);
            _testSeed.parameters = new SeedDataSO.SeedParameters
            {
                seed = 54321,
                name = "Test Mountain",
                scale = 2.0f
            };
            _testSeed.description = "Test procedural mountain biome";
        }

        [TearDown]
        public void Teardown()
        {
            if (_testSeed != null)
                Object.DestroyImmediate(_testSeed);
        }

        #region Phase A: Serialization & Deserialization

        [Test]
        public void Serialize_ValidSeed_ProducesValidJSON()
        {
            // Act
            var json = _serializer.Serialize(_testSeed);

            // Assert
            Assert.IsNotNull(json);
            Assert.IsNotEmpty(json);
            Assert.That(json, Does.Contain("\"ugcId\":"));
            Assert.That(json, Does.Contain("test-seed-001"));
            Assert.That(json, Does.Contain("\"createdBy\":"));
            Assert.That(json, Does.Contain("test-player"));
        }

        [Test]
        public void Deserialize_ValidJSON_RestoresObject()
        {
            // Arrange
            var json = _serializer.Serialize(_testSeed);

            // Act
            var loaded = _serializer.Deserialize<SeedDataSO>(json);

            // Assert
            Assert.IsNotNull(loaded);
            Assert.AreEqual(_testSeed.ugcId, loaded.ugcId);
            Assert.AreEqual(_testSeed.createdBy, loaded.createdBy);
            Assert.AreEqual(_testSeed.createdAt, loaded.createdAt);
            Assert.AreEqual(_testSeed.parameters.seed, loaded.parameters.seed);
            Assert.AreEqual(_testSeed.parameters.name, loaded.parameters.name);
            Assert.AreEqual(_testSeed.parameters.scale, loaded.parameters.scale);
            Assert.AreEqual(_testSeed.description, loaded.description);
        }

        [Test]
        public void Serialize_Deserialize_RoundtripPreservesData()
        {
            // Act
            var json1 = _serializer.Serialize(_testSeed);
            var loaded1 = _serializer.Deserialize<SeedDataSO>(json1);
            var json2 = _serializer.Serialize(loaded1);
            var loaded2 = _serializer.Deserialize<SeedDataSO>(json2);

            // Assert
            Assert.AreEqual(loaded1.ugcId, loaded2.ugcId);
            Assert.AreEqual(loaded1.parameters.seed, loaded2.parameters.seed);
            Assert.AreEqual(loaded1.parameters.name, loaded2.parameters.name);
            Assert.AreEqual(loaded1.parameters.scale, loaded2.parameters.scale);
        }

        #endregion

        #region Phase A: Schema Validation

        [Test]
        public void ValidateSchema_ValidJSON_ReturnsValid()
        {
            // Arrange
            var json = _serializer.Serialize(_testSeed);

            // Act
            var result = _serializer.ValidateSchema(json, typeof(SeedDataSO));

            // Assert
            Assert.IsTrue(result.IsValid);
            Assert.IsEmpty(result.InvalidFields);
        }

        [Test]
        public void ValidateSchema_InvalidJSON_ReturnsFalse()
        {
            // Arrange
            var invalidJson = "{invalid json";

            // Act
            var result = _serializer.ValidateSchema(invalidJson, typeof(SeedDataSO));

            // Assert
            Assert.IsFalse(result.IsValid);
            Assert.That(result.ErrorMessage, Does.Contain("Invalid JSON"));
        }

        [Test]
        public void ValidateSchema_UnknownField_DetectsAndRejects()
        {
            // Arrange - create JSON with extra field
            var validJson = _serializer.Serialize(_testSeed);
            var withHackedField = validJson.Replace("}", ", \"hackedField\": \"exploit\"}");

            // Act
            var result = _serializer.ValidateSchema(withHackedField, typeof(SeedDataSO));

            // Assert
            Assert.IsFalse(result.IsValid);
            Assert.Contains("hackedField", result.InvalidFields);
            Assert.That(result.ErrorMessage, Does.Contain("not in schema"));
        }

        #endregion

        #region Phase C: Sandbox Validation

        [Test]
        public void Deserialize_JSONWithHackedField_ThrowsException()
        {
            // Arrange - create JSON with unauthorized field
            var validJson = _serializer.Serialize(_testSeed);
            var hackedJson = validJson.Replace("}", ", \"exploitField\": \"malicious\"}");

            // Act & Assert
            Assert.Throws<InvalidOperationException>(() =>
            {
                _serializer.Deserialize<SeedDataSO>(hackedJson);
            });
        }

        [Test]
        public void Sandbox_ValidJSON_LoadsSuccessfully()
        {
            // Arrange - sample-001.json equivalent
            var sampleJson = @"{
  ""ugcId"": ""seed-001"",
  ""createdBy"": ""player"",
  ""createdAt"": ""2026-05-17T12:00:00Z"",
  ""parameters"": {
    ""seed"": 12345,
    ""name"": ""Mountain Valley"",
    ""scale"": 1.5
  },
  ""description"": ""Procedural mountain biome""
}";

            // Act
            var loaded = _serializer.Deserialize<SeedDataSO>(sampleJson);

            // Assert
            Assert.IsNotNull(loaded);
            Assert.AreEqual("seed-001", loaded.ugcId);
            Assert.AreEqual("Mountain Valley", loaded.parameters.name);
        }

        [Test]
        public void Sandbox_InvalidJSON_WithExtraField_RejectsLoad()
        {
            // Arrange - sample with unauthorized field
            var hackedJson = @"{
  ""ugcId"": ""seed-002"",
  ""createdBy"": ""player"",
  ""createdAt"": ""2026-05-17T12:00:00Z"",
  ""hackedField"": ""exploit"",
  ""parameters"": {
    ""seed"": 12345,
    ""name"": ""Mountain Valley"",
    ""scale"": 1.5
  },
  ""description"": ""Procedural mountain biome""
}";

            // Act & Assert
            var ex = Assert.Throws<InvalidOperationException>(() =>
            {
                _serializer.Deserialize<SeedDataSO>(hackedJson);
            });

            Assert.That(ex.Message, Does.Contain("schema validation failed"));
        }

        #endregion

        #region Edge Cases

        [Test]
        public void Deserialize_NullInput_ThrowsException()
        {
            Assert.Throws<ArgumentException>(() =>
            {
                _serializer.Deserialize<SeedDataSO>(null);
            });
        }

        [Test]
        public void Deserialize_EmptyInput_ThrowsException()
        {
            Assert.Throws<ArgumentException>(() =>
            {
                _serializer.Deserialize<SeedDataSO>("");
            });
        }

        [Test]
        public void Serialize_NullInput_ThrowsException()
        {
            Assert.Throws<ArgumentNullException>(() =>
            {
                _serializer.Serialize(null);
            });
        }

        [Test]
        public void ValidateSchema_EmptyJSON_ReturnsFalse()
        {
            var result = _serializer.ValidateSchema("", typeof(SeedDataSO));
            Assert.IsFalse(result.IsValid);
        }

        #endregion
    }
}
