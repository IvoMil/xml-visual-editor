#pragma once

#include <optional>
#include <string>
#include <vector>

namespace xve {

// ============================================================================
// Constants
// ============================================================================

/// Sentinel value representing unbounded occurrences (xs:maxOccurs="unbounded").
/// Used in place of -1 wherever max_occurs appears.
inline constexpr int kUnbounded = -1;

// ============================================================================
// ElementInfo — describes an XSD element declaration
// ============================================================================

struct ElementInfo {
    std::string name;
    std::string namespace_uri;  // empty = no namespace
    std::string type_name;      // resolved type name (stripped of namespace prefix)
    int min_occurs = 1;
    int max_occurs = 1;  // kUnbounded (-1) = unbounded
    bool nillable = false;
    bool is_abstract = false;
    std::string substitution_group;  // empty = none
    std::string default_value;       // empty = none
    std::string fixed_value;         // empty = none
    std::string documentation;       // XSD annotation/documentation text
    std::string appinfo;             // XSD annotation/appinfo text
    bool is_wildcard = false;                // true for xs:any elements
    std::string namespace_constraint;        // xs:any "namespace" attribute (e.g., "##any", specific URI)
    std::string process_contents;            // xs:any "processContents" attribute ("strict", "lax", "skip")
    std::string choice_path;         // Groups elements in choice branches (empty = not in choice)

    bool operator==(const ElementInfo&) const = default;
};

// ============================================================================
// AttributeInfo — describes an XSD attribute declaration
// ============================================================================

struct AttributeInfo {
    std::string name;
    std::string type_name;
    bool required = false;
    std::string default_value;  // empty = none
    std::string fixed_value;    // empty = none
    std::string use;            // "required", "optional", "prohibited"
    std::string documentation;
    bool is_wildcard = false;                // true for xs:anyAttribute
    std::string namespace_constraint;        // xs:anyAttribute "namespace" attribute
    std::string process_contents;            // xs:anyAttribute "processContents" attribute

    bool operator==(const AttributeInfo&) const = default;
};

// ============================================================================
// TypeInfo — describes an XSD simple or complex type
// ============================================================================

struct TypeInfo {
    std::string name;
    std::string base_type;  // parent type for restriction/extension chains
    bool is_simple = false;
    bool is_complex = false;
    std::vector<std::string> enumerations;  // for simple types with enumeration facets
    std::vector<std::string> member_types;  // resolved union member type names
    std::string documentation;
    std::string appinfo;

    // Restriction facets (XSD simple-type restrictions).
    struct Restrictions {
        std::optional<std::string> min_inclusive;
        std::optional<std::string> max_inclusive;
        std::optional<std::string> min_exclusive;
        std::optional<std::string> max_exclusive;
        std::optional<int> min_length;
        std::optional<int> max_length;
        std::optional<std::string> pattern;  // regex constraint

        bool operator==(const Restrictions&) const = default;
    };
    Restrictions restrictions;

    bool operator==(const TypeInfo&) const = default;
};

// ============================================================================
// ContentModelInfo — describes the content model of a complex type
// ============================================================================

/// A named sequence of elements, typically a branch within a choice compositor.
struct SequenceGroupInfo {
    std::string name;                   // display name, e.g. "Sequence containing X"
    std::string choice_path;            // identifier for this choice branch
    std::vector<ElementInfo> elements;  // all elements in the sequence
    bool has_required = false;          // whether the sequence contains required elements
    std::string required_element_name;  // name of first required element (empty if none)

    bool operator==(const SequenceGroupInfo&) const = default;
};

/// Represents the compositor structure (sequence / choice / all / …) of a complex type.
struct ContentModelInfo {
    std::string model_type;             // "sequence", "choice", "all", "empty", "simple", "mixed"
    std::vector<ElementInfo> elements;  // ordered child entries
    int min_occurs = 1;
    int max_occurs = 1;  // kUnbounded (-1) = unbounded

    std::vector<std::vector<std::string>> choice_groups;  // groups of alternatives in a choice
    std::vector<std::pair<int, int>> choice_groups_occurrences;  // {min_occurs, max_occurs} per group
    std::vector<std::string> choice_groups_documentation;        // documentation text per choice group
    std::vector<SequenceGroupInfo> sequence_groups;       // sequences nested in choices

    bool operator==(const ContentModelInfo&) const = default;
};

}  // namespace xve
