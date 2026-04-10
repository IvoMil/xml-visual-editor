#pragma once

// Internal header: content-model tree-building helpers for HelperDataService.
// Not part of the public API.

#include "xmlvisualeditor/schema/schema_types.h"
#include "xmlvisualeditor/services/helper_data_service.h"

#include <map>
#include <string>
#include <unordered_map>
#include <vector>

namespace xve {
namespace helper_tree {

inline auto MakeElementNode(const ElementInfo& elem, const std::map<std::string, int>& counts)
    -> ContentModelNode {
    ContentModelNode node;
    node.name = elem.name;
    node.node_type = "element";
    node.min_occurs = elem.min_occurs;
    node.max_occurs = elem.max_occurs;
    node.type_name = elem.type_name;
    node.documentation = elem.documentation;
    node.is_wildcard = elem.is_wildcard;
    node.namespace_constraint = elem.namespace_constraint;

    auto it = counts.find(elem.name);
    node.current_count = (it != counts.end()) ? it->second : 0;
    node.is_satisfied = node.current_count >= elem.min_occurs;
    node.is_exhausted = (elem.max_occurs != kUnbounded) && (node.current_count >= elem.max_occurs);
    node.can_insert = !node.is_exhausted && !elem.is_wildcard;
    return node;
}

inline void ApplyChoiceExclusion(ContentModelNode& choice_node) {
    std::string active;
    int total = 0;

    for (const auto& child : choice_node.children) {
        if (child.node_type == "element" && child.current_count > 0) {
            total += child.current_count;
            if (active.empty())
                active = child.name;
        } else if (child.node_type == "sequence") {
            bool branch_active = false;
            for (const auto& sub : child.children) {
                if (sub.current_count > 0) {
                    total += sub.current_count;
                    branch_active = true;
                }
            }
            if (branch_active && active.empty()) {
                active = child.children.empty() ? "" : child.children[0].name;
            }
        }
    }

    choice_node.active_branch = active;

    // Propagate active_branch to the active sequence child so the webview
    // auto-expands it (shouldExpand checks active_branch for depth > 0 compositors).
    if (!active.empty()) {
        for (auto& child : choice_node.children) {
            if (child.node_type == "sequence") {
                bool branch_active = false;
                for (const auto& sub : child.children) {
                    if (sub.current_count > 0) {
                        branch_active = true;
                        break;
                    }
                }
                if (branch_active) {
                    child.active_branch = active;
                }
            }
        }
    }

    choice_node.current_count = total;

    // A choice is satisfied when total >= min_occurs, OR when all branches
    // are optional (each branch has minOccurs=0 elements only).
    // Per XSD spec: <choice minOccurs="1"> is satisfied if any branch matches,
    // and a branch with all-optional elements matches zero elements.
    bool all_branches_optional = true;
    for (const auto& child : choice_node.children) {
        if (child.node_type == "element") {
            if (child.min_occurs > 0) { all_branches_optional = false; break; }
        } else if (child.node_type == "sequence") {
            for (const auto& sub : child.children) {
                if (sub.min_occurs > 0) { all_branches_optional = false; break; }
            }
            if (!all_branches_optional) break;
        }
    }
    choice_node.is_satisfied = (total >= choice_node.min_occurs) || (all_branches_optional && total == 0);
    choice_node.is_exhausted = (choice_node.max_occurs != kUnbounded) && (total >= choice_node.max_occurs);
    choice_node.can_insert = !choice_node.is_exhausted;

    if (!active.empty() && choice_node.max_occurs == 1) {
        for (auto& child : choice_node.children) {
            bool is_active = false;
            if (child.node_type == "element") {
                is_active = (child.name == active);
            } else if (child.node_type == "sequence") {
                for (const auto& sub : child.children) {
                    if (sub.name == active) {
                        is_active = true;
                        break;
                    }
                }
            }
            if (!is_active) {
                child.can_insert = false;
                for (auto& sub : child.children)
                    sub.can_insert = false;
            }
        }
    }

    // For repeatable choices (max > 1 or unbounded), propagate choice cardinality
    // to children for display. Element-level max_occurs reflects per-branch limits,
    // but users need the effective cardinality including choice repetitions.
    if (choice_node.max_occurs != 1) {
        for (auto& child : choice_node.children) {
            if (child.node_type == "element") {
                if (choice_node.max_occurs == kUnbounded) {
                    child.max_occurs = kUnbounded;
                } else if (child.max_occurs != kUnbounded) {
                    child.max_occurs *= choice_node.max_occurs;
                }
                child.is_exhausted =
                    (child.max_occurs != kUnbounded) && (child.current_count >= child.max_occurs);
                child.can_insert = !child.is_exhausted && choice_node.can_insert;
            } else if (child.node_type == "sequence") {
                for (auto& sub : child.children) {
                    if (choice_node.max_occurs == kUnbounded) {
                        sub.max_occurs = kUnbounded;
                    } else if (sub.max_occurs != kUnbounded) {
                        sub.max_occurs *= choice_node.max_occurs;
                    }
                    sub.is_exhausted =
                        (sub.max_occurs != kUnbounded) && (sub.current_count >= sub.max_occurs);
                    sub.can_insert = !sub.is_exhausted && choice_node.can_insert;
                }
            }
        }
    }
}

inline auto FindMissingRequired(const std::vector<ContentModelNode>& nodes) -> std::vector<std::string> {
    std::vector<std::string> missing;
    for (const auto& node : nodes) {
        if (node.node_type == "element" && !node.is_satisfied) {
            missing.push_back(node.name);
        } else if (node.node_type == "sequence" || node.node_type == "all") {
            auto sub = FindMissingRequired(node.children);
            missing.insert(missing.end(), sub.begin(), sub.end());
        }
    }
    return missing;
}

inline auto CheckContentComplete(const std::vector<ContentModelNode>& nodes) -> bool {
    for (const auto& node : nodes) {
        if (node.node_type == "element" && !node.is_satisfied)
            return false;
        if (node.node_type == "choice" && !node.is_satisfied)
            return false;
        if (node.node_type != "choice" && !node.children.empty() && !CheckContentComplete(node.children))
            return false;
    }
    return true;
}

// Builds a structured ContentModelNode tree from a schema ContentModelInfo and
// the current instance child-element counts. Defined in helper_data_service_tree.cpp.
auto BuildContentModelTree(const ContentModelInfo& model, const std::map<std::string, int>& counts)
    -> std::vector<ContentModelNode>;

}  // namespace helper_tree
}  // namespace xve
