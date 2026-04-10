#pragma once

#include "xmlvisualeditor/schema/schema_types.h"

#include <pugixml.hpp>

#include <expected>
#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace xve {

/// Parses XSD schema files and provides queries over the parsed schema model.
///
/// Reads XSD XML via pugixml and builds indexed caches of elements, types,
/// content models, and attributes for efficient lookup.
class SchemaParser {
public:
    /// Parse XSD from a string containing XSD content.
    static auto ParseString(std::string_view xsd_content) -> std::expected<SchemaParser, std::string>;

    /// Parse XSD from a filesystem path.
    static auto ParseFile(const std::filesystem::path& path) -> std::expected<SchemaParser, std::string>;

    /// Returns names of all global xs:element declarations.
    auto GetRootElements() const -> std::vector<std::string>;

    /// Returns info for a named global element, or nullopt if not found.
    auto GetElementInfo(const std::string& element_name) const -> std::optional<ElementInfo>;

    /// Returns the names of allowed child elements for the given element.
    auto GetAllowedChildren(const std::string& element_name) const -> std::vector<std::string>;

    /// Returns ordered child ElementInfo entries (preserving XSD declaration order).
    auto GetOrderedChildren(const std::string& element_name) const -> std::vector<ElementInfo>;

    /// Returns the content model (compositor structure) for the given element.
    auto GetContentModel(const std::string& element_name) const -> std::optional<ContentModelInfo>;

    /// Returns allowed attributes keyed by name for the given element.
    auto GetAllowedAttributes(const std::string& element_name) const -> std::unordered_map<std::string, AttributeInfo>;

    /// Returns allowed attributes for a type name only (no element_cache_ fallback).
    auto GetAllowedAttributesByType(const std::string& type_name) const
        -> std::unordered_map<std::string, AttributeInfo>;

    /// Returns the content model for a type name only (no element_cache_ fallback).
    auto GetContentModelByType(const std::string& type_name) const -> std::optional<ContentModelInfo>;

    /// Returns info for a named type, or nullopt if not found.
    auto GetTypeInfo(const std::string& type_name) const -> std::optional<TypeInfo>;

    /// Returns enumeration values for a simple type with xs:enumeration facets.
    auto GetEnumerationValues(const std::string& type_name) const -> std::vector<std::string>;

    /// Returns the xs:annotation/xs:documentation text for the given element.
    auto GetDocumentation(const std::string& element_name) const -> std::string;

    /// Returns the schema's targetNamespace (empty string if none declared).
    auto GetTargetNamespace() const -> std::string;

    /// Resolve element type by walking a path from a root element through content models.
    /// Returns the type_name of the final element in the path, or empty string if not found.
    auto ResolveElementTypeByPath(const std::vector<std::string>& element_path) const -> std::string;

    /// Get ElementInfo by walking a path from a root element through content models.
    /// Returns the ElementInfo from the parent's content model for the final path segment.
    auto GetElementInfoByPath(const std::vector<std::string>& element_path) const -> std::optional<ElementInfo>;

private:
    SchemaParser() = default;

    // Schema traversal
    void ParseSchema(pugi::xml_node schema_node);
    void EnsureTypeProcessed(const std::string& type_name);
    void EnsureElementProcessed(const std::string& element_name);

    // Element / type processing
    auto ProcessElement(pugi::xml_node elem_node) -> ElementInfo;
    void ProcessComplexType(pugi::xml_node type_node, const std::string& context_name);
    void ProcessSimpleType(pugi::xml_node type_node, const std::string& context_name);
    void ExtractAttributes(pugi::xml_node parent, const std::string& context_name);

    // Compositor processing (implemented in schema_parser_compositor.cpp)
    auto ProcessCompositor(pugi::xml_node compositor_node) -> ContentModelInfo;
    void ProcessSequenceChildren(pugi::xml_node seq_node, ContentModelInfo& model);
    void ProcessChoiceChildren(pugi::xml_node choice_node, ContentModelInfo& model);
    void ProcessAllChildren(pugi::xml_node all_node, ContentModelInfo& model);
    void ProcessGroupRef(pugi::xml_node group_ref_node, ContentModelInfo& model);

    // Inheritance resolution
    void ResolveExtension(pugi::xml_node ext_node, const std::string& context_name);
    void ResolveRestriction(pugi::xml_node restr_node, const std::string& context_name);

    // Utilities
    auto XsdName(std::string_view local_name) const -> std::string;
    auto StripPrefix(std::string_view qualified_name) const -> std::string;
    auto ExtractDocumentation(pugi::xml_node node) const -> std::string;
    auto ExtractAppinfo(pugi::xml_node node) const -> std::string;
    static auto FindXsdPrefix(pugi::xml_node schema_node) -> std::string;

    // Cached / indexed state (mutable for on-demand lazy resolution from const query methods)
    std::string target_namespace_;
    std::string xsd_prefix_ = "xs";
    std::unordered_map<std::string, pugi::xml_node> type_nodes_;     // name -> XSD node (for on-demand processing)
    std::unordered_map<std::string, pugi::xml_node> element_nodes_;  // name -> XSD node
    std::unordered_map<std::string, pugi::xml_node> group_nodes_;    // xs:group name -> XSD node
    mutable std::unordered_map<std::string, ElementInfo> element_cache_;
    mutable std::unordered_map<std::string, TypeInfo> type_cache_;
    mutable std::unordered_map<std::string, ContentModelInfo> content_model_cache_;
    mutable std::unordered_map<std::string, std::unordered_map<std::string, AttributeInfo>> attribute_cache_;
    std::vector<std::string> root_elements_;
    mutable std::unordered_set<std::string> processing_types_;        // circular reference guard
    std::unique_ptr<pugi::xml_document> doc_;                         // keeps parsed XSD tree alive
    std::filesystem::path base_dir_;                                  // base directory for resolving xs:include paths
    std::vector<std::unique_ptr<pugi::xml_document>> included_docs_;  // keeps included XSD docs alive
};

}  // namespace xve
