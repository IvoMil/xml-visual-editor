#pragma once

#include "xmlvisualeditor/schema/schema_parser.h"
#include "xmlvisualeditor/services/schema_service.h"

#include <unordered_map>

namespace xve {

class SchemaServiceImpl : public ISchemaService {
public:
    SchemaServiceImpl() = default;

    // Schema loading
    auto LoadSchemaFromString(const std::string& schema_id, std::string_view xsd_content) -> bool override;
    auto LoadSchemaFromFile(const std::string& schema_id, const std::string& file_path) -> bool override;
    auto UnloadSchema(const std::string& schema_id) -> bool override;
    auto IsSchemaLoaded(const std::string& schema_id) const -> bool override;
    auto GetLoadedSchemaIds() const -> std::vector<std::string> override;

    // Schema detection from XML content
    auto DetectSchemaFromXml(std::string_view xml_content) -> std::optional<std::string> override;

    // Element queries
    auto GetRootElements(const std::string& schema_id) -> std::vector<std::string> override;
    auto GetElementInfo(const std::string& schema_id, const std::string& element_name)
        -> std::optional<ElementInfo> override;
    auto GetAllowedChildren(const std::string& schema_id, const std::string& element_name)
        -> std::vector<std::string> override;
    auto GetOrderedChildren(const std::string& schema_id, const std::string& element_name)
        -> std::vector<ElementInfo> override;
    auto GetContentModel(const std::string& schema_id, const std::string& element_name)
        -> std::optional<ContentModelInfo> override;

    // Attribute queries
    auto GetAllowedAttributes(const std::string& schema_id, const std::string& element_name)
        -> std::unordered_map<std::string, AttributeInfo> override;
    auto GetAllowedAttributesByType(const std::string& schema_id, const std::string& type_name) const
        -> std::unordered_map<std::string, AttributeInfo> override;

    // Type-only content model
    auto GetContentModelByType(const std::string& schema_id, const std::string& type_name) const
        -> std::optional<ContentModelInfo> override;

    // Type queries
    auto GetTypeInfo(const std::string& schema_id, const std::string& type_name) -> std::optional<TypeInfo> override;
    auto GetEnumerationValues(const std::string& schema_id, const std::string& type_name)
        -> std::vector<std::string> override;

    // Documentation
    auto GetDocumentation(const std::string& schema_id, const std::string& element_name) -> std::string override;

    // Path-based resolution
    auto ResolveElementTypeByPath(const std::string& schema_id,
                                 const std::vector<std::string>& element_path) -> std::string override;
    auto GetElementInfoByPath(const std::string& schema_id, const std::vector<std::string>& element_path)
        -> std::optional<ElementInfo> override;

    // Schema info
    auto GetTargetNamespace(const std::string& schema_id) -> std::string override;

private:
    auto FindSchema(const std::string& schema_id) -> SchemaParser*;
    auto FindSchema(const std::string& schema_id) const -> const SchemaParser*;

    std::unordered_map<std::string, SchemaParser> loaded_schemas_;
};

}  // namespace xve
