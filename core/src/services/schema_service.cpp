#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/schema_service_impl.h"

namespace xve {

// ============================================================================
// Private helpers
// ============================================================================

auto SchemaServiceImpl::FindSchema(const std::string& schema_id) -> SchemaParser* {
    auto it = loaded_schemas_.find(schema_id);
    return it != loaded_schemas_.end() ? &it->second : nullptr;
}

auto SchemaServiceImpl::FindSchema(const std::string& schema_id) const -> const SchemaParser* {
    auto it = loaded_schemas_.find(schema_id);
    return it != loaded_schemas_.end() ? &it->second : nullptr;
}

// ============================================================================
// Schema loading
// ============================================================================

auto SchemaServiceImpl::LoadSchemaFromString(const std::string& schema_id, std::string_view xsd_content) -> bool {
    auto result = SchemaParser::ParseString(xsd_content);
    if (!result.has_value()) {
        return false;
    }
    loaded_schemas_.insert_or_assign(schema_id, std::move(result.value()));
    return true;
}

auto SchemaServiceImpl::LoadSchemaFromFile(const std::string& schema_id, const std::string& file_path) -> bool {
    auto result = SchemaParser::ParseFile(file_path);
    if (!result.has_value()) {
        return false;
    }
    loaded_schemas_.insert_or_assign(schema_id, std::move(result.value()));
    return true;
}

auto SchemaServiceImpl::UnloadSchema(const std::string& schema_id) -> bool {
    return loaded_schemas_.erase(schema_id) > 0;
}

auto SchemaServiceImpl::IsSchemaLoaded(const std::string& schema_id) const -> bool {
    return loaded_schemas_.contains(schema_id);
}

auto SchemaServiceImpl::GetLoadedSchemaIds() const -> std::vector<std::string> {
    std::vector<std::string> ids;
    ids.reserve(loaded_schemas_.size());
    for (const auto& [id, _] : loaded_schemas_) {
        ids.push_back(id);
    }
    return ids;
}

// ============================================================================
// Schema detection from XML content
// ============================================================================

auto SchemaServiceImpl::DetectSchemaFromXml(std::string_view xml_content) -> std::optional<std::string> {
    auto [doc, parse_result] = Document::ParseString(xml_content);
    if (!doc) {
        return std::nullopt;
    }
    return doc->DetectSchemaUrl();
}

// ============================================================================
// Element queries
// ============================================================================

auto SchemaServiceImpl::GetRootElements(const std::string& schema_id) -> std::vector<std::string> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetRootElements();
}

auto SchemaServiceImpl::GetElementInfo(const std::string& schema_id, const std::string& element_name)
    -> std::optional<ElementInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return std::nullopt;
    return parser->GetElementInfo(element_name);
}

auto SchemaServiceImpl::GetAllowedChildren(const std::string& schema_id, const std::string& element_name)
    -> std::vector<std::string> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetAllowedChildren(element_name);
}

auto SchemaServiceImpl::GetOrderedChildren(const std::string& schema_id, const std::string& element_name)
    -> std::vector<ElementInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetOrderedChildren(element_name);
}

auto SchemaServiceImpl::GetContentModel(const std::string& schema_id, const std::string& element_name)
    -> std::optional<ContentModelInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return std::nullopt;
    return parser->GetContentModel(element_name);
}

// ============================================================================
// Attribute queries
// ============================================================================

auto SchemaServiceImpl::GetAllowedAttributes(const std::string& schema_id, const std::string& element_name)
    -> std::unordered_map<std::string, AttributeInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetAllowedAttributes(element_name);
}

auto SchemaServiceImpl::GetAllowedAttributesByType(const std::string& schema_id,
                                                    const std::string& type_name) const
    -> std::unordered_map<std::string, AttributeInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetAllowedAttributesByType(type_name);
}

auto SchemaServiceImpl::GetContentModelByType(const std::string& schema_id, const std::string& type_name) const
    -> std::optional<ContentModelInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return std::nullopt;
    return parser->GetContentModelByType(type_name);
}

// ============================================================================
// Type queries
// ============================================================================

auto SchemaServiceImpl::GetTypeInfo(const std::string& schema_id, const std::string& type_name)
    -> std::optional<TypeInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return std::nullopt;
    return parser->GetTypeInfo(type_name);
}

auto SchemaServiceImpl::GetEnumerationValues(const std::string& schema_id, const std::string& type_name)
    -> std::vector<std::string> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetEnumerationValues(type_name);
}

// ============================================================================
// Documentation
// ============================================================================

auto SchemaServiceImpl::GetDocumentation(const std::string& schema_id, const std::string& element_name) -> std::string {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetDocumentation(element_name);
}

// ============================================================================
// Path-based resolution
// ============================================================================

auto SchemaServiceImpl::ResolveElementTypeByPath(const std::string& schema_id,
                                                 const std::vector<std::string>& element_path) -> std::string {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->ResolveElementTypeByPath(element_path);
}

auto SchemaServiceImpl::GetElementInfoByPath(const std::string& schema_id,
                                             const std::vector<std::string>& element_path)
    -> std::optional<ElementInfo> {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return std::nullopt;
    return parser->GetElementInfoByPath(element_path);
}

// ============================================================================
// Schema info
// ============================================================================

auto SchemaServiceImpl::GetTargetNamespace(const std::string& schema_id) -> std::string {
    auto* parser = FindSchema(schema_id);
    if (!parser)
        return {};
    return parser->GetTargetNamespace();
}

}  // namespace xve
