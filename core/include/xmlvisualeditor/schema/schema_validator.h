#pragma once

#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/schema/schema_types.h"

#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace xve {

class ISchemaService;

/// Validates an XML document against a loaded XSD schema via ISchemaService.
///
/// Walks the XML tree and checks each element/attribute against the schema
/// definitions, producing diagnostics with line/column positions.
class SchemaValidator {
public:
    /// Validate XML content against a schema loaded in the service.
    /// Returns a vector of diagnostics (empty = valid).
    static auto Validate(std::string_view xml_content, ISchemaService& schema_service, const std::string& schema_id)
        -> std::vector<Diagnostic>;

private:
    SchemaValidator(std::string_view xml_content, ISchemaService& schema_service, const std::string& schema_id);

    void ValidateElement(const Element& element, bool is_root, const std::vector<std::string>& element_path);
    void ValidateAttributes(const Element& element, const std::string& element_name,
                            const std::vector<std::string>& element_path);
    void ValidateChildren(const Element& element, const std::string& element_name,
                          const std::vector<std::string>& element_path);
    void ValidateTextContent(const Element& element, const std::string& element_name,
                             const std::vector<std::string>& element_path);
    bool CheckUnionValue(const std::string& text, const TypeInfo& union_type, int depth = 0);

    void AddDiagnostic(const Element& element, const std::string& message, const std::string& severity = "error");
    auto OffsetToLineColumn(size_t offset) const -> std::pair<int, int>;

    auto CachedResolveType(const std::vector<std::string>& element_path) -> std::string;
    auto CachedGetContentModel(const std::string& lookup_key, bool type_only = false)
        -> std::optional<ContentModelInfo>;

    ISchemaService& schema_service_;
    const std::string& schema_id_;
    std::string_view xml_content_;
    std::vector<size_t> line_offsets_;  // byte offset of each line start
    std::vector<Diagnostic> diagnostics_;

    // Per-validation caches (populated lazily, valid for one Validate() call)
    std::unordered_map<std::string, std::string> type_resolution_cache_;  // path_key → type_name
    std::unordered_map<std::string, std::optional<ContentModelInfo>> content_model_cache_;
};

}  // namespace xve
