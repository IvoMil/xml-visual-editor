#include "xmlvisualeditor/schema/schema_parser.h"

#include <charconv>

namespace xve {

namespace {

/// Parse an xs:minOccurs / xs:maxOccurs attribute value.
int ParseOccurs(pugi::xml_attribute attr, int default_val) {
    if (!attr)
        return default_val;
    std::string_view value = attr.as_string();
    if (value.empty())
        return default_val;
    if (value == "unbounded")
        return kUnbounded;
    int result = default_val;
    std::from_chars(value.data(), value.data() + value.size(), result);
    return result;
}

}  // namespace

// ============================================================================
// Compositor entry point
// ============================================================================

auto SchemaParser::ProcessCompositor(pugi::xml_node compositor_node) -> ContentModelInfo {
    ContentModelInfo model;
    model.min_occurs = ParseOccurs(compositor_node.attribute("minOccurs"), 1);
    model.max_occurs = ParseOccurs(compositor_node.attribute("maxOccurs"), 1);

    std::string_view node_name = compositor_node.name();
    if (node_name == XsdName("sequence")) {
        model.model_type = "sequence";
        ProcessSequenceChildren(compositor_node, model);
    } else if (node_name == XsdName("choice")) {
        model.model_type = "choice";
        ProcessChoiceChildren(compositor_node, model);
        // Populate choice_groups_occurrences for each group added by ProcessChoiceChildren.
        // When a choice is the root compositor, min/max come from the choice element itself.
        while (model.choice_groups_occurrences.size() < model.choice_groups.size()) {
            model.choice_groups_occurrences.emplace_back(model.min_occurs, model.max_occurs);
        }
    } else if (node_name == XsdName("all")) {
        model.model_type = "all";
        ProcessAllChildren(compositor_node, model);
    }

    // Safety-net: ensure choice_groups and choice_groups_occurrences are always in sync.
    // Fill any gaps with permissive defaults to avoid false positives.
    while (model.choice_groups_occurrences.size() < model.choice_groups.size()) {
        model.choice_groups_occurrences.emplace_back(0, kUnbounded);
    }
    // Truncate orphaned occurrences that exceed the number of choice groups.
    if (model.choice_groups_occurrences.size() > model.choice_groups.size()) {
        model.choice_groups_occurrences.resize(model.choice_groups.size());
    }
    // Keep choice_groups_documentation in sync with choice_groups.
    while (model.choice_groups_documentation.size() < model.choice_groups.size()) {
        model.choice_groups_documentation.emplace_back("");
    }
    if (model.choice_groups_documentation.size() > model.choice_groups.size()) {
        model.choice_groups_documentation.resize(model.choice_groups.size());
    }

    return model;
}

// ============================================================================
// Sequence processing — flattens child elements and nested compositors
// ============================================================================

void SchemaParser::ProcessSequenceChildren(pugi::xml_node seq_node, ContentModelInfo& model) {
    for (auto child : seq_node.children()) {
        std::string_view child_name = child.name();
        if (child_name == XsdName("element")) {
            model.elements.push_back(ProcessElement(child));
        } else if (child_name == XsdName("choice")) {
            int choice_min = ParseOccurs(child.attribute("minOccurs"), 1);
            int choice_max = ParseOccurs(child.attribute("maxOccurs"), 1);
            size_t before = model.elements.size();
            ProcessChoiceChildren(child, model);
            // DO NOT propagate choice min/max to elements — validator uses choice_groups_occurrences.
            // Store occurrence info for the choice group just added by ProcessChoiceChildren.
            // Pad any missing entries (from nested choices) with defaults first.
            while (model.choice_groups_occurrences.size() + 1 < model.choice_groups.size()) {
                model.choice_groups_occurrences.emplace_back(1, 1);
            }
            model.choice_groups_occurrences.emplace_back(choice_min, choice_max);
        } else if (child_name == XsdName("sequence")) {
            // Nested sequence within sequence: flatten into parent model.
            // If the nested sequence has minOccurs="0", all its children become effectively optional.
            int nested_min = ParseOccurs(child.attribute("minOccurs"), 1);
            int nested_max = ParseOccurs(child.attribute("maxOccurs"), 1);
            size_t before = model.elements.size();
            ProcessSequenceChildren(child, model);
            if (nested_min == 0) {
                for (size_t i = before; i < model.elements.size(); ++i) {
                    model.elements[i].min_occurs = 0;
                }
            }
            if (nested_max == kUnbounded) {
                for (size_t i = before; i < model.elements.size(); ++i) {
                    model.elements[i].max_occurs = kUnbounded;
                }
            } else if (nested_max > 1) {
                for (size_t i = before; i < model.elements.size(); ++i) {
                    if (model.elements[i].max_occurs != kUnbounded) {
                        model.elements[i].max_occurs *= nested_max;
                    }
                }
            }
        } else if (child_name == XsdName("any")) {
            ElementInfo any_elem;
            any_elem.name = "*";
            any_elem.type_name = "any";
            any_elem.is_wildcard = true;
            any_elem.min_occurs = ParseOccurs(child.attribute("minOccurs"), 1);
            any_elem.max_occurs = ParseOccurs(child.attribute("maxOccurs"), 1);
            auto ns_attr = child.attribute("namespace");
            if (ns_attr) {
                any_elem.namespace_constraint = ns_attr.value();
            }
            auto pc_attr = child.attribute("processContents");
            if (pc_attr) {
                any_elem.process_contents = pc_attr.value();
            }
            any_elem.documentation = ExtractDocumentation(child);
            model.elements.push_back(std::move(any_elem));
        } else if (child_name == XsdName("group")) {
            int group_min = ParseOccurs(child.attribute("minOccurs"), 1);
            int group_max = ParseOccurs(child.attribute("maxOccurs"), 1);
            ProcessGroupRef(child, model);
            // If the group ref expanded to choice group(s), store their occurrence info.
            for (size_t i = model.choice_groups_occurrences.size(); i < model.choice_groups.size(); ++i) {
                model.choice_groups_occurrences.emplace_back(group_min, group_max);
            }
        }
    }
}

// ============================================================================
// Choice processing — each branch gets a choice_path annotation
// ============================================================================

void SchemaParser::ProcessChoiceChildren(pugi::xml_node choice_node, ContentModelInfo& model) {
    std::vector<std::string> choice_group;

    for (auto branch : choice_node.children()) {
        std::string_view branch_name = branch.name();

        if (branch_name == XsdName("element")) {
            // Single-element branch.
            auto elem = ProcessElement(branch);
            elem.choice_path = elem.name;
            choice_group.push_back(elem.name);
            if (!elem.name.empty()) {
                auto it = element_cache_.find(elem.name);
                if (it != element_cache_.end()) {
                    it->second.choice_path = elem.choice_path;
                    if (elem.max_occurs == kUnbounded || it->second.max_occurs == kUnbounded) {
                        it->second.max_occurs = kUnbounded;
                    } else {
                        it->second.max_occurs = std::max(it->second.max_occurs, elem.max_occurs);
                    }
                } else {
                    element_cache_[elem.name] = elem;
                }
            }
            model.elements.push_back(std::move(elem));

        } else if (branch_name == XsdName("sequence")) {
            // Sequence-within-choice: delegate to ProcessSequenceChildren for full handling
            // (elements, group refs, nested compositors), then post-process with choice_path.
            std::string first_name;
            SequenceGroupInfo seq_group;
            size_t elem_before = model.elements.size();

            ProcessSequenceChildren(branch, model);

            // Propagate the sequence's own minOccurs/maxOccurs to its children.
            int seq_max = ParseOccurs(branch.attribute("maxOccurs"), 1);
            // DO NOT zero out min_occurs for seq_min==0 — validator uses choice_members tracking.
            if (seq_max == kUnbounded) {
                for (size_t i = elem_before; i < model.elements.size(); ++i) {
                    model.elements[i].max_occurs = kUnbounded;
                }
            } else if (seq_max > 1) {
                for (size_t i = elem_before; i < model.elements.size(); ++i) {
                    if (model.elements[i].max_occurs != kUnbounded) {
                        model.elements[i].max_occurs *= seq_max;
                    }
                }
            }

            for (size_t i = elem_before; i < model.elements.size(); ++i) {
                if (first_name.empty())
                    first_name = model.elements[i].name;
                model.elements[i].choice_path = first_name;
                if (!model.elements[i].name.empty()) {
                    auto it = element_cache_.find(model.elements[i].name);
                    if (it != element_cache_.end()) {
                        it->second.choice_path = first_name;
                        if (model.elements[i].max_occurs == kUnbounded || it->second.max_occurs == kUnbounded) {
                            it->second.max_occurs = kUnbounded;
                        } else {
                            it->second.max_occurs = std::max(it->second.max_occurs, model.elements[i].max_occurs);
                        }
                    } else {
                        element_cache_[model.elements[i].name] = model.elements[i];
                    }
                }
                seq_group.elements.push_back(model.elements[i]);
                if (model.elements[i].min_occurs > 0) {
                    seq_group.has_required = true;
                    if (seq_group.required_element_name.empty()) {
                        seq_group.required_element_name = model.elements[i].name;
                    }
                }
            }

            if (!first_name.empty()) {
                choice_group.push_back(first_name);
                seq_group.name = "Sequence containing " + first_name;
                seq_group.choice_path = first_name;
                model.sequence_groups.push_back(std::move(seq_group));
            }

        } else if (branch_name == XsdName("choice")) {
            // Nested choice: merge its alternatives into the outer choice_group.
            size_t cg_before = model.choice_groups.size();
            size_t cgo_before = model.choice_groups_occurrences.size();
            ProcessChoiceChildren(branch, model);
            if (model.choice_groups.size() > cg_before) {
                for (size_t i = cg_before; i < model.choice_groups.size(); ++i) {
                    for (const auto& name : model.choice_groups[i]) {
                        choice_group.push_back(name);
                    }
                }
                model.choice_groups.erase(
                    model.choice_groups.begin() + static_cast<std::ptrdiff_t>(cg_before),
                    model.choice_groups.end());
                // Also erase any orphaned choice_groups_occurrences entries added by inner compositors.
                if (model.choice_groups_occurrences.size() > cgo_before) {
                    model.choice_groups_occurrences.erase(
                        model.choice_groups_occurrences.begin() + static_cast<std::ptrdiff_t>(cgo_before),
                        model.choice_groups_occurrences.end());
                }
                if (model.choice_groups_documentation.size() > cg_before) {
                    model.choice_groups_documentation.erase(
                        model.choice_groups_documentation.begin() + static_cast<std::ptrdiff_t>(cg_before),
                        model.choice_groups_documentation.end());
                }
            }
        } else if (branch_name == XsdName("group")) {
            // Group reference as a choice branch — inline its compositor content.
            // Merge any new choice_groups created by the group ref into the outer choice_group.
            size_t cg_before = model.choice_groups.size();
            size_t cgo_before = model.choice_groups_occurrences.size();
            size_t elem_before = model.elements.size();
            ProcessGroupRef(branch, model);

            size_t new_elem_count = model.elements.size() - elem_before;
            size_t new_cg_count = model.choice_groups.size() - cg_before;

            // Count how many elements the new choice_groups account for.
            size_t inner_choice_elem_count = 0;
            for (size_t i = cg_before; i < model.choice_groups.size(); ++i) {
                inner_choice_elem_count += model.choice_groups[i].size();
            }

            bool has_new_choices = new_cg_count > 0;
            bool has_non_choice_elements = new_elem_count > inner_choice_elem_count;

            if (has_new_choices && has_non_choice_elements) {
                // Group ref is a SEQUENCE containing nested choices.
                // Treat as a sequence branch — the nested choice_groups belong INSIDE
                // this sequence, not at the outer level.
                std::string first_name = model.elements[elem_before].name;
                choice_group.push_back(first_name);

                for (size_t i = elem_before; i < model.elements.size(); ++i) {
                    model.elements[i].choice_path = first_name;
                }

                if (new_elem_count > 1) {
                    SequenceGroupInfo seq_group;
                    seq_group.name = "Group ref sequence";
                    seq_group.choice_path = first_name;
                    for (size_t i = elem_before; i < model.elements.size(); ++i) {
                        seq_group.elements.push_back(model.elements[i]);
                        if (model.elements[i].min_occurs > 0) {
                            seq_group.has_required = true;
                            if (seq_group.required_element_name.empty()) {
                                seq_group.required_element_name = model.elements[i].name;
                            }
                        }
                    }
                    model.sequence_groups.push_back(std::move(seq_group));
                }
            } else if (has_new_choices) {
                // Group ref expanded to a PURE CHOICE: merge all new choice_group entries into outer.
                for (size_t i = cg_before; i < model.choice_groups.size(); ++i) {
                    for (const auto& name : model.choice_groups[i]) {
                        choice_group.push_back(name);
                    }
                }
                model.choice_groups.erase(
                    model.choice_groups.begin() + static_cast<std::ptrdiff_t>(cg_before),
                    model.choice_groups.end());
                if (model.choice_groups_occurrences.size() > cgo_before) {
                    model.choice_groups_occurrences.erase(
                        model.choice_groups_occurrences.begin() + static_cast<std::ptrdiff_t>(cgo_before),
                        model.choice_groups_occurrences.end());
                }
                if (model.choice_groups_documentation.size() > cg_before) {
                    model.choice_groups_documentation.erase(
                        model.choice_groups_documentation.begin() + static_cast<std::ptrdiff_t>(cg_before),
                        model.choice_groups_documentation.end());
                }
            } else if (elem_before < model.elements.size()) {
                // Group ref expanded to sequence/all with NO nested choices: treat as sequence branch.
                std::string first_name = model.elements[elem_before].name;
                choice_group.push_back(first_name);
                for (size_t i = elem_before; i < model.elements.size(); ++i) {
                    model.elements[i].choice_path = first_name;
                }
                if (model.elements.size() - elem_before > 1) {
                    SequenceGroupInfo seq_group;
                    seq_group.name = "Group ref sequence";
                    seq_group.choice_path = first_name;
                    for (size_t i = elem_before; i < model.elements.size(); ++i) {
                        seq_group.elements.push_back(model.elements[i]);
                        if (model.elements[i].min_occurs > 0) {
                            seq_group.has_required = true;
                            if (seq_group.required_element_name.empty()) {
                                seq_group.required_element_name = model.elements[i].name;
                            }
                        }
                    }
                    model.sequence_groups.push_back(std::move(seq_group));
                }
            }
        }
    }

    if (!choice_group.empty()) {
        model.choice_groups.push_back(std::move(choice_group));
        model.choice_groups_documentation.push_back(ExtractDocumentation(choice_node));
    }
}

// ============================================================================
// All processing — unordered children, max_occurs capped at 1
// ============================================================================

void SchemaParser::ProcessAllChildren(pugi::xml_node all_node, ContentModelInfo& model) {
    for (auto child : all_node.children()) {
        std::string_view child_name = child.name();
        if (child_name == XsdName("element")) {
            auto elem = ProcessElement(child);
            if (elem.max_occurs > 1 || elem.max_occurs == kUnbounded) {
                elem.max_occurs = 1;
            }
            model.elements.push_back(std::move(elem));
        } else if (child_name == XsdName("group")) {
            ProcessGroupRef(child, model);
        }
    }
}

// ============================================================================
// Group reference processing — inlines the referenced group's compositor
// ============================================================================

void SchemaParser::ProcessGroupRef(pugi::xml_node group_ref_node, ContentModelInfo& model) {
    auto ref_attr = group_ref_node.attribute("ref");
    if (!ref_attr)
        return;

    std::string ref_name = StripPrefix(ref_attr.as_string());
    auto it = group_nodes_.find(ref_name);
    if (it == group_nodes_.end())
        return;

    auto group_node = it->second;
    int ref_min = ParseOccurs(group_ref_node.attribute("minOccurs"), 1);
    int ref_max = ParseOccurs(group_ref_node.attribute("maxOccurs"), 1);
    size_t before = model.elements.size();

    // A named group has exactly one child compositor (sequence, choice, or all).
    for (auto child : group_node.children()) {
        std::string_view child_name = child.name();
        if (child_name == XsdName("sequence")) {
            ProcessSequenceChildren(child, model);
            break;
        } else if (child_name == XsdName("choice")) {
            ProcessChoiceChildren(child, model);
            break;
        } else if (child_name == XsdName("all")) {
            ProcessAllChildren(child, model);
            break;
        }
    }

    if (ref_min == 0) {
        for (size_t i = before; i < model.elements.size(); ++i) {
            model.elements[i].min_occurs = 0;
        }
    }
    // Propagate group ref maxOccurs to child elements
    if (ref_max == kUnbounded) {
        for (size_t i = before; i < model.elements.size(); ++i) {
            model.elements[i].max_occurs = kUnbounded;
        }
    } else if (ref_max > 1) {
        for (size_t i = before; i < model.elements.size(); ++i) {
            if (model.elements[i].max_occurs != kUnbounded) {
                model.elements[i].max_occurs *= ref_max;
            }
        }
    }

    // Sync element_cache_ with the propagated cardinality so that
    // GetElementInfo() (the fallback when path-based lookup fails)
    // returns the group-ref-adjusted values.
    for (size_t i = before; i < model.elements.size(); ++i) {
        const auto& elem = model.elements[i];
        if (!elem.name.empty()) {
            auto cache_it = element_cache_.find(elem.name);
            if (cache_it != element_cache_.end()) {
                cache_it->second.min_occurs = std::min(cache_it->second.min_occurs, elem.min_occurs);
                if (elem.max_occurs == kUnbounded || cache_it->second.max_occurs == kUnbounded) {
                    cache_it->second.max_occurs = kUnbounded;
                } else {
                    cache_it->second.max_occurs = std::max(cache_it->second.max_occurs, elem.max_occurs);
                }
            }
        }
    }
}

}  // namespace xve
