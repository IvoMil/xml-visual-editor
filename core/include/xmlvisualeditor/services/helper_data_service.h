#pragma once

#include "xmlvisualeditor/schema/schema_types.h"

#include <map>
#include <optional>
#include <string>
#include <vector>

namespace xve {

// Content model node with instance state (for Elements panel V2).
struct ContentModelNode {
    std::string name;       // element name, or empty for compositor nodes
    std::string node_type;  // "element", "choice", "sequence", "all"
    int min_occurs = 1;
    int max_occurs = 1;         // kUnbounded (-1) = unbounded
    int current_count = 0;      // actual children in document
    bool is_satisfied = true;   // current_count >= min_occurs
    bool is_exhausted = false;  // current_count >= max_occurs (never for unbounded)
    bool can_insert = true;     // !is_exhausted AND choice rules permit
    std::string active_branch;  // for choice: name of active branch element (empty if none)
    std::string type_name;
    std::string documentation;
    bool is_wildcard = false;                // true for xs:any wildcard elements
    std::string namespace_constraint;        // allowed namespace(s) for the wildcard
    std::vector<ContentModelNode> children;  // nested compositor children
};

// Elements panel data (returned by helper.getElementsPanelData).
struct ElementsPanelData {
    std::string anchor_element;
    std::vector<std::string> anchor_path;
    std::vector<ContentModelNode> content_model;
    bool content_complete = false;
    std::vector<std::string> missing_required;
};

// Attribute with instance state (for Attributes panel V2).
struct AttributeInstanceInfo {
    std::string name;
    std::string type_name;
    std::string use;            // "required", "optional", "prohibited"
    bool is_set = false;        // attribute exists in document
    std::string current_value;  // actual value in document (empty if not set)
    std::string default_value;
    std::string fixed_value;
    std::vector<std::string> enum_values;
    std::string documentation;
    bool is_wildcard = false;
    std::string namespace_constraint;
    std::string process_contents;
};

// Attributes panel data (returned by helper.getAttributesPanelData).
struct AttributesPanelData {
    std::string element_name;
    int min_occurs = 1;
    std::vector<AttributeInstanceInfo> attributes;
};

// Compositor context for Info panel.
struct CompositorContext {
    std::string parent_compositor;  // "sequence", "choice", "all", or empty
    std::string parent_element;
    std::vector<std::string> preceding_siblings;
    std::vector<std::string> following_siblings;
    std::vector<std::string> choice_alternatives;  // if in a choice group
};

// Instance state summary.
struct InstanceState {
    int current_count = 0;
    bool is_satisfied = true;
    bool is_exhausted = false;
    bool can_insert = true;
    bool content_complete = false;
    std::vector<std::string> missing_required;
};

// Node details (returned by helper.getNodeDetails).
struct NodeDetails {
    std::string name;
    std::string type_name;
    std::string documentation;
    std::string xpath;
    int min_occurs = 1;
    int max_occurs = 1;
    std::vector<std::string> enum_values;
    TypeInfo::Restrictions restrictions;
    std::string appinfo;
    std::optional<CompositorContext> compositor_context;
    std::optional<InstanceState> instance_state;
};

/// Info about a single inserted element during recursive insert.
struct InsertedElementInfo {
    std::string name;
    std::vector<std::string> path;
    int depth = 0;
};

/// Result of InsertElement.
struct InsertElementResult {
    bool success = false;
    std::string new_content;
    int inserted_line = -1;    // 0-based line of the opening tag
    int inserted_column = -1;  // 0-based column of the opening tag
};

/// Result of InsertRequiredChildren.
struct InsertRequiredResult {
    bool success = false;
    std::string new_content;
    std::vector<InsertedElementInfo> inserted;
    int total_inserted = 0;
};

class IDocumentService;
class ISchemaService;

class IHelperDataService {
public:
    virtual ~IHelperDataService() = default;

    virtual auto ComputeElementsPanelData(const std::string& schema_id,
                                          const std::string& element_name,
                                          const std::vector<std::string>& element_path,
                                          const std::string& doc_id) -> std::optional<ElementsPanelData> = 0;

    virtual auto ComputeAttributesPanelData(const std::string& schema_id,
                                            const std::string& element_name,
                                            const std::vector<std::string>& element_path,
                                            const std::string& doc_id) -> std::optional<AttributesPanelData> = 0;

    virtual auto ComputeNodeDetails(const std::string& schema_id,
                                    const std::string& element_name,
                                    const std::vector<std::string>& element_path,
                                    const std::string& doc_id) -> std::optional<NodeDetails> = 0;

    virtual auto InsertElement(const std::string& doc_id,
                               const std::string& schema_id,
                               const std::vector<std::string>& parent_path,
                               const std::string& element_name,
                               int cursor_line = -1) -> InsertElementResult = 0;

    virtual auto InsertRequiredChildren(const std::string& doc_id,
                                        const std::string& schema_id,
                                        const std::vector<std::string>& element_path) -> InsertRequiredResult = 0;
};

}  // namespace xve
