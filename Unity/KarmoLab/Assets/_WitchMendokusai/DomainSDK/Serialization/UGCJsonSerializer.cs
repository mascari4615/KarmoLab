using System;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using UnityEngine;
using WitchMendokusai.DomainSDK.Data;

namespace WitchMendokusai.DomainSDK.Serialization
{
    /// <summary>
    /// Validation result for schema validation.
    /// </summary>
    public class ValidationResult
    {
        public bool IsValid { get; set; }
        public string ErrorMessage { get; set; }
        public List<string> InvalidFields { get; set; } = new();

        public ValidationResult() { }

        public ValidationResult(bool isValid, string errorMessage = "")
        {
            IsValid = isValid;
            ErrorMessage = errorMessage;
        }
    }

    /// <summary>
    /// DomainSDK schema 기반 UGC JSON 직렬화.
    ///
    /// - 입력: DomainSDK 정의 DataSO (예: SeedDataSO, StoryDataSO 등)
    /// - 출력: JSON (에디터 친화 + 외부 도구 호환)
    /// - 검증: JSON → DataSO schema 원형 재구성만 가능 (추가 필드 X)
    /// </summary>
    public class UGCJsonSerializer
    {
        private readonly JsonSerializerOptions _jsonOptions;

        public UGCJsonSerializer()
        {
            _jsonOptions = new JsonSerializerOptions
            {
                WriteIndented = true,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
                Converters =
                {
                    new JsonStringEnumConverter(),
                    new DateTimeConverter(),
                }
            };
        }

        /// <summary>
        /// Serialize a DataSO object to JSON string.
        ///
        /// Only fields defined in the DomainSDK schema are serialized.
        /// </summary>
        /// <param name="dataObject">The ScriptableObject to serialize.</param>
        /// <returns>JSON string representation of the object.</returns>
        public string Serialize(ScriptableObject dataObject)
        {
            if (dataObject == null)
                throw new ArgumentNullException(nameof(dataObject));

            if (!(dataObject is UGCDataSO ugcData))
                throw new ArgumentException($"Object must inherit from UGCDataSO, got {dataObject.GetType().Name}");

            // Create a dictionary from the object's serializable fields
            var dict = ExtractSerializableFields(ugcData);

            // Serialize to JSON
            return JsonSerializer.Serialize(dict, _jsonOptions);
        }

        /// <summary>
        /// Deserialize a JSON string to a DataSO object of type T.
        ///
        /// Validates schema before deserialization.
        /// </summary>
        /// <typeparam name="T">The target type (must inherit from UGCDataSO).</typeparam>
        /// <param name="json">The JSON string to deserialize.</param>
        /// <returns>Deserialized object of type T.</returns>
        public T Deserialize<T>(string json) where T : UGCDataSO
        {
            if (string.IsNullOrWhiteSpace(json))
                throw new ArgumentException("JSON string cannot be empty", nameof(json));

            // Validate schema first
            var validation = ValidateSchema(json, typeof(T));
            if (!validation.IsValid)
                throw new InvalidOperationException($"JSON schema validation failed: {validation.ErrorMessage}");

            // Parse JSON
            using (var doc = JsonDocument.Parse(json))
            {
                var root = doc.RootElement;
                var instance = ScriptableObject.CreateInstance<T>();

                // Populate base UGCDataSO fields
                if (root.TryGetProperty("ugcId", out var ugcIdElem))
                    instance.ugcId = ugcIdElem.GetString();

                if (root.TryGetProperty("createdBy", out var createdByElem))
                    instance.createdBy = createdByElem.GetString();

                if (root.TryGetProperty("createdAt", out var createdAtElem))
                {
                    if (DateTime.TryParse(createdAtElem.GetString(), out var createdAt))
                        instance.createdAt = createdAt;
                }

                // Populate derived fields using reflection
                PopulateFieldsFromJson(instance, root);

                // Validate the deserialized object
                if (!instance.ValidateFields(out string errorMsg))
                    throw new InvalidOperationException($"Object validation failed: {errorMsg}");

                return instance;
            }
        }

        /// <summary>
        /// Validate that a JSON string only contains fields defined in the schema type.
        ///
        /// Rejects JSON with additional fields not in DomainSDK schema.
        /// </summary>
        /// <param name="json">The JSON string to validate.</param>
        /// <param name="schemaType">The schema type (must inherit from UGCDataSO).</param>
        /// <returns>ValidationResult with details if validation fails.</returns>
        public ValidationResult ValidateSchema(string json, Type schemaType)
        {
            if (string.IsNullOrWhiteSpace(json))
                return new ValidationResult(false, "JSON string cannot be empty");

            if (!typeof(UGCDataSO).IsAssignableFrom(schemaType))
                return new ValidationResult(false, $"Schema type {schemaType.Name} must inherit from UGCDataSO");

            try
            {
                using (var doc = JsonDocument.Parse(json))
                {
                    var root = doc.RootElement;
                    var allowedFields = GetAllowedFields(schemaType);

                    var invalidFields = new List<string>();
                    foreach (var prop in root.EnumerateObject())
                    {
                        if (!allowedFields.Contains(prop.Name))
                            invalidFields.Add(prop.Name);
                    }

                    if (invalidFields.Count > 0)
                    {
                        var result = new ValidationResult(false,
                            $"JSON contains fields not in schema: {string.Join(", ", invalidFields)}");
                        result.InvalidFields = invalidFields;
                        return result;
                    }

                    return new ValidationResult(true);
                }
            }
            catch (JsonException ex)
            {
                return new ValidationResult(false, $"Invalid JSON: {ex.Message}");
            }
        }

        /// <summary>
        /// Extract serializable fields from a UGCDataSO object into a dictionary.
        /// </summary>
        private Dictionary<string, object> ExtractSerializableFields(UGCDataSO dataObject)
        {
            var dict = new Dictionary<string, object>
            {
                { "ugcId", dataObject.ugcId },
                { "createdBy", dataObject.createdBy },
                { "createdAt", dataObject.createdAt.ToString("O") } // ISO 8601 format
            };

            // Add all serializable fields from derived types
            var type = dataObject.GetType();
            var fields = type.GetFields(BindingFlags.Public | BindingFlags.Instance);

            foreach (var field in fields)
            {
                // Skip base class fields (already handled above)
                if (field.DeclaringType == typeof(UGCDataSO) ||
                    field.DeclaringType == typeof(ScriptableObject) ||
                    field.DeclaringType == typeof(UnityEngine.Object))
                    continue;

                // Skip fields marked with [SerializeField(false)]
                var hideAttr = field.GetCustomAttribute<HideInInspector>();
                if (hideAttr != null)
                    continue;

                var value = field.GetValue(dataObject);
                if (value != null)
                    dict[field.Name] = value;
            }

            return dict;
        }

        /// <summary>
        /// Get all allowed field names for a given schema type.
        /// </summary>
        private HashSet<string> GetAllowedFields(Type schemaType)
        {
            var allowed = new HashSet<string>
            {
                "ugcId",
                "createdBy",
                "createdAt"
            };

            // Add all public fields from the derived type
            var fields = schemaType.GetFields(BindingFlags.Public | BindingFlags.Instance);
            foreach (var field in fields)
            {
                // Skip base class fields
                if (field.DeclaringType == typeof(UGCDataSO) ||
                    field.DeclaringType == typeof(ScriptableObject) ||
                    field.DeclaringType == typeof(UnityEngine.Object))
                    continue;

                // Skip hidden fields
                var hideAttr = field.GetCustomAttribute<HideInInspector>();
                if (hideAttr != null)
                    continue;

                allowed.Add(field.Name);
            }

            return allowed;
        }

        /// <summary>
        /// Populate object fields from JSON element using reflection.
        /// </summary>
        private void PopulateFieldsFromJson<T>(T instance, JsonElement root) where T : UGCDataSO
        {
            var type = instance.GetType();
            var fields = type.GetFields(BindingFlags.Public | BindingFlags.Instance);

            foreach (var field in fields)
            {
                // Skip base class fields (already handled in Deserialize)
                if (field.DeclaringType == typeof(UGCDataSO) ||
                    field.DeclaringType == typeof(ScriptableObject) ||
                    field.DeclaringType == typeof(UnityEngine.Object))
                    continue;

                if (!root.TryGetProperty(field.Name, out var element))
                    continue;

                try
                {
                    var value = DeserializeValue(element, field.FieldType);
                    field.SetValue(instance, value);
                }
                catch (Exception ex)
                {
                    Debug.LogError($"Failed to deserialize field '{field.Name}': {ex.Message}");
                }
            }
        }

        /// <summary>
        /// Deserialize a JSON element to a specific type.
        /// </summary>
        private object DeserializeValue(JsonElement element, Type targetType)
        {
            // Handle null
            if (element.ValueKind == JsonValueKind.Null)
                return targetType.IsValueType ? Activator.CreateInstance(targetType) : null;

            // Handle basic types
            if (targetType == typeof(string))
                return element.GetString();
            if (targetType == typeof(int))
                return element.GetInt32();
            if (targetType == typeof(float))
                return element.GetSingle();
            if (targetType == typeof(double))
                return element.GetDouble();
            if (targetType == typeof(bool))
                return element.GetBoolean();
            if (targetType == typeof(DateTime))
            {
                var str = element.GetString();
                if (DateTime.TryParse(str, out var dt))
                    return dt;
                return default(DateTime);
            }

            // For complex types, try JSON deserialization
            var json = element.GetRawText();
            return JsonSerializer.Deserialize(json, targetType, _jsonOptions);
        }
    }

    /// <summary>
    /// Custom JSON converter for DateTime to ISO 8601 format.
    /// </summary>
    public class DateTimeConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            var str = reader.GetString();
            if (DateTime.TryParse(str, out var dt))
                return dt;
            return default;
        }

        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
        {
            writer.WriteStringValue(value.ToString("O"));
        }
    }
}
