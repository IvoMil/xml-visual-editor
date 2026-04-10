#include "xmlvisualeditor/schema/schema_validator.h"

#include "xmlvisualeditor/schema/schema_types.h"
#include "xmlvisualeditor/services/schema_service.h"

#include <algorithm>
#include <regex>
#include <sstream>
#include <unordered_map>
#include <unordered_set>

namespace {
std::string JoinPath(const std::vector<std::string>& path) {
    std::string result;
    for (size_t i = 0; i < path.size(); ++i) {
        if (i > 0) result += '/';
        result += path[i];
    }
    return result;
}
}  // namespace

namespace xve {

// ============================================================================
// Public API
// ============================================================================

auto SchemaValidator::Validate(std::string_view xml_content,
                               ISchemaService& schema_service,
                               const std::string& schema_id) -> std::vector<Diagnostic> {
    // Parse the XML first. If it fails, return parse errors.
    auto [doc, result] = Document::ParseString(xml_content);
    if (!result.success || !doc) {
        return std::move(result.diagnostics);
    }

    SchemaValidator validator(xml_content, schema_service, schema_id);

    Element root = doc->Root();
    if (root) {
        validator.ValidateElement(root, /*is_root=*/true, /*element_path=*/{});
    }

    return std::move(validator.diagnostics_);
}

// ============================================================================
// Constructor
// ============================================================================

SchemaValidator::SchemaValidator(std::string_view xml_content,
                                 ISchemaService& schema_service,
                                 const std::string& schema_id)
    : schema_service_(schema_service), schema_id_(schema_id), xml_content_(xml_content) {
    // Build line offset table: line_offsets_[i] = byte offset of line i+1 start.
    line_offsets_.push_back(0);
    for (size_t i = 0; i < xml_content_.size(); ++i) {
        if (xml_content_[i] == '\n') {
            line_offsets_.push_back(i + 1);
        }
    }
}

// ============================================================================
// Element validation
// ============================================================================

void SchemaValidator::ValidateElement(const Element& element, bool is_root,
                                      const std::vector<std::string>& element_path) {
    std::string local_name = element.LocalName();

    // Build path for this element
    std::vector<std::string> current_path = element_path;
    current_path.push_back(local_name);

    if (is_root) {
        auto root_elements = schema_service_.GetRootElements(schema_id_);
        if (!root_elements.empty()) {
            auto it = std::find(root_elements.begin(), root_elements.end(), local_name);
            if (it == root_elements.end()) {
                std::ostringstream msg;
                msg << "Root element '" << local_name << "' is not declared in the schema. Allowed root elements: [";
                for (size_t i = 0; i < root_elements.size(); ++i) {
                    if (i > 0)
                        msg << ", ";
                    msg << root_elements[i];
                }
                msg << "]";
                AddDiagnostic(element, msg.str());
            }
        }
    }

    // Use path-based lookup when path has > 1 element, fall back to name-based for root
    std::optional<ElementInfo> elem_info;
    if (current_path.size() > 1) {
        elem_info = schema_service_.GetElementInfoByPath(schema_id_, current_path);
    }
    if (!elem_info) {
        elem_info = schema_service_.GetElementInfo(schema_id_, local_name);
    }
    if (!elem_info) {
        return;
    }

    ValidateAttributes(element, local_name, current_path);
    ValidateChildren(element, local_name, current_path);
    ValidateTextContent(element, local_name, current_path);
}

// ============================================================================
// Cached wrapper methods
// ============================================================================

auto SchemaValidator::CachedResolveType(const std::vector<std::string>& element_path) -> std::string {
    std::string key = JoinPath(element_path);
    auto it = type_resolution_cache_.find(key);
    if (it != type_resolution_cache_.end()) {
        return it->second;
    }
    auto resolved = schema_service_.ResolveElementTypeByPath(schema_id_, element_path);
    type_resolution_cache_[key] = resolved;
    return resolved;
}

auto SchemaValidator::CachedGetContentModel(const std::string& lookup_key,
                                             bool type_only) -> std::optional<ContentModelInfo> {
    auto it = content_model_cache_.find(lookup_key);
    if (it != content_model_cache_.end()) {
        return it->second;
    }
    std::optional<ContentModelInfo> model;
    if (type_only) {
        model = schema_service_.GetContentModelByType(schema_id_, lookup_key);
    } else {
        model = schema_service_.GetContentModel(schema_id_, lookup_key);
    }
    content_model_cache_[lookup_key] = model;
    return model;
}

// ============================================================================
// Diagnostic helpers
// ============================================================================

void SchemaValidator::AddDiagnostic(const Element& element, const std::string& message, const std::string& severity) {
    size_t offset = element.PugiNode().offset_debug();
    auto [line, column] = OffsetToLineColumn(offset);

    Diagnostic diag;
    diag.line = line;
    diag.column = column;
    diag.message = message;
    diag.severity = severity;
    diag.element_path = element.GetPath();
    diagnostics_.push_back(std::move(diag));
}

auto SchemaValidator::OffsetToLineColumn(size_t offset) const -> std::pair<int, int> {
    // Binary search for the line containing this offset
    auto it = std::upper_bound(line_offsets_.begin(), line_offsets_.end(), offset);
    if (it != line_offsets_.begin()) {
        --it;
    }
    auto index = static_cast<size_t>(std::distance(line_offsets_.begin(), it));
    int line = static_cast<int>(index) + 1;                            // 1-based
    int column = static_cast<int>(offset - line_offsets_[index]) + 1;  // 1-based
    return {line, column};
}

}  // namespace xve
