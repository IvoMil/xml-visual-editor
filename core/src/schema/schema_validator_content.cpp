#include "xmlvisualeditor/schema/schema_validator.h"

#include "xmlvisualeditor/schema/schema_types.h"
#include "xmlvisualeditor/services/schema_service.h"

#include <algorithm>
#include <sstream>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace xve {

// ============================================================================
// Attribute validation
// ============================================================================

void SchemaValidator::ValidateAttributes(const Element& element, const std::string& element_name,
                                         const std::vector<std::string>& element_path) {
    // Resolve the element's type via path for accurate attribute lookup.
    std::unordered_map<std::string, AttributeInfo> allowed;
    std::string lookup_key = element_name;
    if (element_path.size() > 1) {
        auto resolved_type = CachedResolveType(element_path);
        if (!resolved_type.empty()) {
            lookup_key = resolved_type;
            // Use type-specific lookup to avoid element_cache_ name collisions.
            allowed = schema_service_.GetAllowedAttributesByType(schema_id_, resolved_type);
        }
    }
    if (allowed.empty() && lookup_key == element_name) {
        // No type resolution or type has no attributes — fall back to element name lookup.
        allowed = schema_service_.GetAllowedAttributes(schema_id_, element_name);
    }
    auto attrs = element.GetAttributes();

    // Check for unknown attributes
    for (const auto& [attr_name, attr_value] : attrs) {
        // Skip namespace declarations and xsi attributes
        if (attr_name.starts_with("xmlns:") || attr_name == "xmlns" || attr_name.starts_with("xsi:")) {
            continue;
        }

        if (allowed.find(attr_name) == allowed.end()) {
            std::ostringstream msg;
            msg << "Unknown attribute '" << attr_name << "' on element '" << element_name << "'. Allowed: [";
            bool first = true;
            for (const auto& [name, info] : allowed) {
                if (!first)
                    msg << ", ";
                msg << name;
                first = false;
            }
            msg << "]";
            AddDiagnostic(element, msg.str());
        }
    }

    // Check for missing required attributes
    for (const auto& [attr_name, attr_info] : allowed) {
        if (attr_info.required && !element.HasAttribute(attr_name)) {
            std::ostringstream msg;
            msg << "Missing required attribute '" << attr_name << "' on element '" << element_name << "'";
            AddDiagnostic(element, msg.str());
        }
    }
}

// ============================================================================
// Children validation
// ============================================================================

void SchemaValidator::ValidateChildren(const Element& element, const std::string& element_name,
                                       const std::vector<std::string>& element_path) {
    // Resolve the element's type via path for accurate content model lookup.
    std::string lookup_key = element_name;
    bool resolved_via_type = false;
    if (element_path.size() > 1) {
        auto resolved_type = CachedResolveType(element_path);
        if (!resolved_type.empty()) {
            lookup_key = resolved_type;
            resolved_via_type = true;
        }
    }

    // Get content model: use type-specific lookup when type was resolved, to avoid
    // element_cache_ name collisions (e.g., type "string" vs element named "string").
    std::vector<std::string> allowed_names;
    std::vector<ElementInfo> ordered_children;
    if (resolved_via_type) {
        auto model = schema_service_.GetContentModelByType(schema_id_, lookup_key);
        if (model) {
            allowed_names.reserve(model->elements.size());
            for (const auto& elem : model->elements)
                allowed_names.push_back(elem.name);
            ordered_children = model->elements;
        }
    } else {
        allowed_names = schema_service_.GetAllowedChildren(schema_id_, lookup_key);
        ordered_children = schema_service_.GetOrderedChildren(schema_id_, lookup_key);
    }
    auto children = element.Children();

    // Count occurrences of each child element name
    std::unordered_map<std::string, int> child_counts;

    for (const auto& child : children) {
        std::string child_name = child.LocalName();
        child_counts[child_name]++;

        // Check if this child is allowed
        if (!allowed_names.empty()) {
            auto it = std::find(allowed_names.begin(), allowed_names.end(), child_name);
            if (it == allowed_names.end()) {
                // Check for xs:any wildcard ("*")
                if (std::find(allowed_names.begin(), allowed_names.end(), "*") != allowed_names.end()) {
                    // Allowed by wildcard
                } else if (child.Name().find(':') != std::string::npos) {
                    // Namespace-prefixed element — skip validation for extension elements
                } else {
                    std::ostringstream msg;
                    msg << "Element '" << child_name << "' is not allowed as child of '" << element_name
                        << "'. Allowed: [";
                    for (size_t i = 0; i < allowed_names.size(); ++i) {
                        if (i > 0)
                            msg << ", ";
                        msg << allowed_names[i];
                    }
                    msg << "]";
                    AddDiagnostic(child, msg.str());
                    continue;
                }
            }
        }

        // Recursively validate the child
        ValidateElement(child, /*is_root=*/false, element_path);
    }

    // Build set of elements that belong to any choice group (they should not have individual minOccurs checks).
    // Also build a map from element name → choice group index for maxOccurs lookup.
    std::unordered_set<std::string> choice_members;
    std::unordered_map<std::string, size_t> choice_member_group_index;
    auto content_model = CachedGetContentModel(lookup_key, resolved_via_type);
    if (content_model) {
        for (size_t gi = 0; gi < content_model->choice_groups.size(); ++gi) {
            for (const auto& member : content_model->choice_groups[gi]) {
                choice_members.insert(member);
                // Prefer the choice group with the highest maxOccurs (especially kUnbounded)
                // to prevent false "Too many" errors when the same element appears in multiple
                // choice groups (e.g., from group refs with bounded maxOccurs + unbounded choice).
                auto existing = choice_member_group_index.find(member);
                if (existing != choice_member_group_index.end() &&
                    existing->second < content_model->choice_groups_occurrences.size() &&
                    gi < content_model->choice_groups_occurrences.size()) {
                    int old_max = content_model->choice_groups_occurrences[existing->second].second;
                    int new_max = content_model->choice_groups_occurrences[gi].second;
                    if (new_max == kUnbounded || (old_max != kUnbounded && new_max > old_max)) {
                        existing->second = gi;
                    }
                } else {
                    choice_member_group_index[member] = gi;
                }
            }
        }
        // Also include elements from sequence-within-choice groups.
        for (const auto& seq_group : content_model->sequence_groups) {
            // Find which choice group this sequence belongs to
            size_t parent_gi = 0;
            bool found = false;
            for (size_t gi = 0; gi < content_model->choice_groups.size() && !found; ++gi) {
                for (const auto& member : content_model->choice_groups[gi]) {
                    if (member == seq_group.choice_path) {
                        parent_gi = gi;
                        found = true;
                        break;
                    }
                }
            }
            for (const auto& elem : seq_group.elements) {
                choice_members.insert(elem.name);
                if (found) {
                    // Same preference logic: keep the group with the highest maxOccurs.
                    auto existing = choice_member_group_index.find(elem.name);
                    if (existing != choice_member_group_index.end() &&
                        existing->second < content_model->choice_groups_occurrences.size() &&
                        parent_gi < content_model->choice_groups_occurrences.size()) {
                        int old_max = content_model->choice_groups_occurrences[existing->second].second;
                        int new_max = content_model->choice_groups_occurrences[parent_gi].second;
                        if (new_max == kUnbounded || (old_max != kUnbounded && new_max > old_max)) {
                            existing->second = parent_gi;
                        }
                    } else if (existing == choice_member_group_index.end()) {
                        choice_member_group_index[elem.name] = parent_gi;
                    }
                }
            }
        }
    }

    // If the content model's root compositor is optional (minOccurs=0), check whether ANY of its
    // elements are present. If none are, the entire compositor is "absent" and minOccurs checks
    // should be skipped. This handles <sequence minOccurs="0"> wrapping required elements.
    bool skip_min_occurs = false;
    if (content_model && content_model->min_occurs == 0) {
        bool any_present = false;
        for (const auto& ci : ordered_children) {
            if (child_counts.count(ci.name) && child_counts[ci.name] > 0) {
                any_present = true;
                break;
            }
        }
        if (!any_present) {
            skip_min_occurs = true;
        }
    }

    // Cardinality validation
    for (const auto& child_info : ordered_children) {
        int count = child_counts.count(child_info.name) ? child_counts[child_info.name] : 0;

        if (count < child_info.min_occurs && child_info.min_occurs > 0 && !skip_min_occurs &&
            choice_members.find(child_info.name) == choice_members.end()) {
            std::ostringstream msg;
            msg << "Element '" << child_info.name << "' is required in '" << element_name
                << "' (minOccurs=" << child_info.min_occurs << ", found=" << count << ")";
            AddDiagnostic(element, msg.str());
        }

        if (child_info.max_occurs != kUnbounded && count > child_info.max_occurs) {
            // If the element belongs to a choice group, use the group's maxOccurs to compute the effective max.
            auto cg_it = choice_member_group_index.find(child_info.name);
            if (cg_it != choice_member_group_index.end() && content_model &&
                cg_it->second < content_model->choice_groups_occurrences.size()) {
                int choice_max = content_model->choice_groups_occurrences[cg_it->second].second;
                if (choice_max == kUnbounded) {
                    continue;  // Choice repeats unboundedly — element count is unconstrained.
                }
                int effective_max = child_info.max_occurs * choice_max;
                if (count <= effective_max) {
                    continue;  // Within effective limit (element_max × choice_max).
                }
            }
            // If the root compositor allows repetition (e.g., <sequence maxOccurs="unbounded">),
            // the effective element max is element_max × compositor_max.
            if (content_model && content_model->max_occurs != 1) {
                if (content_model->max_occurs == kUnbounded) {
                    continue;  // Root compositor repeats unbounded — element count is unconstrained.
                }
                int effective_max = child_info.max_occurs * content_model->max_occurs;
                if (count <= effective_max) {
                    continue;
                }
            }
            std::ostringstream msg;
            msg << "Too many '" << child_info.name << "' elements in '" << element_name
                << "' (maxOccurs=" << child_info.max_occurs << ", found=" << count << ")";
            AddDiagnostic(element, msg.str());
        }
    }

    // ── Choice group satisfaction ─────────────────────────────────────────
    // Each required (minOccurs > 0) choice group must have at least one
    // member present.  Nested choice groups (whose members all live inside
    // a single sequence_group) are checked only when their parent sequence
    // branch is active (≥1 element present).
    if (content_model && !skip_min_occurs) {
        // Map element name → index into sequence_groups
        std::unordered_map<std::string, size_t> elem_to_sg;
        for (size_t si = 0; si < content_model->sequence_groups.size(); ++si) {
            for (const auto& se : content_model->sequence_groups[si].elements) {
                elem_to_sg[se.name] = si;
            }
        }

        // Map element name → min_occurs from the flattened element list.
        // When a group ref has minOccurs="0", the parser sets all its expanded
        // elements to min_occurs=0, even though inner choice_groups_occurrences
        // may still say {1,1}.  We use this to detect optional group refs.
        std::unordered_map<std::string, int> elem_min_occurs;
        for (const auto& ci : ordered_children) {
            elem_min_occurs[ci.name] = ci.min_occurs;
        }

        for (size_t gi = 0; gi < content_model->choice_groups.size(); ++gi) {
            if (gi >= content_model->choice_groups_occurrences.size()) break;
            int cg_min = content_model->choice_groups_occurrences[gi].first;
            if (cg_min <= 0) continue;

            // If every member of this choice group has min_occurs==0, the choice
            // originated from an optional group ref (minOccurs="0") — skip.
            bool all_members_optional = true;
            for (const auto& member : content_model->choice_groups[gi]) {
                auto mit = elem_min_occurs.find(member);
                if (mit == elem_min_occurs.end() || mit->second > 0) {
                    all_members_optional = false;
                    break;
                }
            }
            if (all_members_optional) continue;

            // Is the group already satisfied?
            bool any_present = false;
            for (const auto& member : content_model->choice_groups[gi]) {
                if (child_counts.count(member) && child_counts.at(member) > 0) {
                    any_present = true;
                    break;
                }
                // If this member is a sequence-group representative, also check
                // whether any other element in that sequence is present.
                for (const auto& sg : content_model->sequence_groups) {
                    if (!sg.elements.empty() && sg.elements[0].name == member) {
                        for (const auto& se : sg.elements) {
                            if (child_counts.count(se.name) && child_counts.at(se.name) > 0) {
                                any_present = true;
                                break;
                            }
                        }
                        break;
                    }
                }
                if (any_present) break;
            }
            if (any_present) continue;

            // Determine whether this is a nested choice (all members in the
            // same sequence_group).
            bool all_in_same_sg = true;
            size_t common_sg = static_cast<size_t>(-1);
            for (const auto& member : content_model->choice_groups[gi]) {
                auto it = elem_to_sg.find(member);
                if (it == elem_to_sg.end()) {
                    all_in_same_sg = false;
                    break;
                }
                if (common_sg == static_cast<size_t>(-1)) {
                    common_sg = it->second;
                } else if (it->second != common_sg) {
                    all_in_same_sg = false;
                    break;
                }
            }

            // For nested choices, skip validation if the parent sequence
            // branch is inactive (none of its elements are present).
            if (all_in_same_sg && common_sg != static_cast<size_t>(-1)) {
                bool sg_active = false;
                for (const auto& se : content_model->sequence_groups[common_sg].elements) {
                    if (child_counts.count(se.name) && child_counts.at(se.name) > 0) {
                        sg_active = true;
                        break;
                    }
                }
                if (!sg_active) continue;
            }

            // Emit diagnostic.
            std::ostringstream msg;
            msg << "Missing required choice in '" << element_name << "': expected one of [";
            for (size_t i = 0; i < content_model->choice_groups[gi].size(); ++i) {
                if (i > 0) msg << ", ";
                msg << content_model->choice_groups[gi][i];
            }
            msg << "]";
            AddDiagnostic(element, msg.str());
        }
    }
}

}  // namespace xve
