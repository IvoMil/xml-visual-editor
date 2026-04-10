#pragma once

#include "xmlvisualeditor/schema/schema_types.h"

#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace xve {

class ISchemaService {
public:
    virtual ~ISchemaService() = default;

    // Schema loading
    virtual auto LoadSchemaFromString(const std::string& schema_id, std::string_view xsd_content) -> bool = 0;
    virtual auto LoadSchemaFromFile(const std::string& schema_id, const std::string& file_path) -> bool = 0;
    virtual auto UnloadSchema(const std::string& schema_id) -> bool = 0;
    virtual auto IsSchemaLoaded(const std::string& schema_id) const -> bool = 0;
    virtual auto GetLoadedSchemaIds() const -> std::vector<std::string> = 0;

    // Schema detection from XML content
    virtual auto DetectSchemaFromXml(std::string_view xml_content) -> std::optional<std::string> = 0;

    // Element queries
    virtual auto GetRootElements(const std::string& schema_id) -> std::vector<std::string> = 0;
    virtual auto GetElementInfo(const std::string& schema_id, const std::string& element_name)
        -> std::optional<ElementInfo> = 0;
    virtual auto GetAllowedChildren(const std::string& schema_id, const std::string& element_name)
        -> std::vector<std::string> = 0;
    virtual auto GetOrderedChildren(const std::string& schema_id, const std::string& element_name)
        -> std::vector<ElementInfo> = 0;
    virtual auto GetContentModel(const std::string& schema_id, const std::string& element_name)
        -> std::optional<ContentModelInfo> = 0;

    // Attribute queries
    virtual auto GetAllowedAttributes(const std::string& schema_id, const std::string& element_name)
        -> std::unordered_map<std::string, AttributeInfo> = 0;
    virtual auto GetAllowedAttributesByType(const std::string& schema_id, const std::string& type_name) const
        -> std::unordered_map<std::string, AttributeInfo> = 0;

    // Type-only content model (no element_cache_ fallback)
    virtual auto GetContentModelByType(const std::string& schema_id, const std::string& type_name) const
        -> std::optional<ContentModelInfo> = 0;

    // Type queries
    virtual auto GetTypeInfo(const std::string& schema_id, const std::string& type_name) -> std::optional<TypeInfo> = 0;
    virtual auto GetEnumerationValues(const std::string& schema_id, const std::string& type_name)
        -> std::vector<std::string> = 0;

    // Documentation
    virtual auto GetDocumentation(const std::string& schema_id, const std::string& element_name) -> std::string = 0;

    // Path-based resolution
    virtual auto ResolveElementTypeByPath(const std::string& schema_id,
                                         const std::vector<std::string>& element_path) -> std::string = 0;
    virtual auto GetElementInfoByPath(const std::string& schema_id,
                                     const std::vector<std::string>& element_path)
        -> std::optional<ElementInfo> = 0;

    // Schema info
    virtual auto GetTargetNamespace(const std::string& schema_id) -> std::string = 0;
};

}  // namespace xve
