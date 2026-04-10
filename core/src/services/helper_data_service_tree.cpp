#include "helper_data_service_tree.h"

#include <set>
#include <unordered_map>

namespace xve {
namespace helper_tree {

auto BuildContentModelTree(const ContentModelInfo& model, const std::map<std::string, int>& counts)
    -> std::vector<ContentModelNode> {
    std::vector<ContentModelNode> result;

    if (model.model_type == "empty" || model.model_type == "simple")
        return result;

    constexpr size_t kNoGroup = static_cast<size_t>(-1);

    // Top-level choice model: wrap all elements in a choice node.
    if (model.model_type == "choice") {
        ContentModelNode choice_node;
        choice_node.node_type = "choice";
        choice_node.min_occurs = model.min_occurs;
        choice_node.max_occurs = model.max_occurs;

        if (!model.choice_groups.empty()) {
            // Build a set of elements that are sequence-group representatives.
            std::set<std::string> seq_group_reps;
            for (const auto& sg : model.sequence_groups) {
                if (!sg.elements.empty())
                    seq_group_reps.insert(sg.elements[0].name);
            }

            // The last choice_group is the top-level choice; earlier groups are nested
            // (added by ProcessSequenceChildren within group-ref expansion).
            const auto& top_group = model.choice_groups.back();
            for (const auto& name : top_group) {
                // Check if this name represents a sequence group in the choice.
                bool is_seq_group = seq_group_reps.count(name) > 0;
                if (is_seq_group) {
                    // Find the matching sequence_group and build a sequence node,
                    // reconstructing nested choice groups within.
                    for (const auto& sg : model.sequence_groups) {
                        if (!sg.elements.empty() && sg.elements[0].name == name) {
                            // Build elem→choice_group mapping for nested choice detection.
                            std::unordered_map<std::string, size_t> local_elem_to_cg;
                            for (size_t gi2 = 0; gi2 < model.choice_groups.size(); ++gi2) {
                                for (const auto& cg_name : model.choice_groups[gi2]) {
                                    local_elem_to_cg[cg_name] = gi2;
                                }
                            }
                            // Determine which choice_group this sequence belongs to.
                            size_t parent_cg = kNoGroup;
                            {
                                auto pcg_it = local_elem_to_cg.find(name);
                                if (pcg_it != local_elem_to_cg.end())
                                    parent_cg = pcg_it->second;
                            }

                            ContentModelNode seq_node;
                            seq_node.node_type = "sequence";

                            size_t nested_cg = kNoGroup;
                            std::vector<ContentModelNode> nested_collected;

                            auto flush_nested = [&]() {
                                if (nested_cg == kNoGroup || nested_collected.empty()) return;
                                ContentModelNode ncn;
                                ncn.node_type = "choice";
                                if (nested_cg < model.choice_groups_occurrences.size()) {
                                    ncn.min_occurs = model.choice_groups_occurrences[nested_cg].first;
                                    ncn.max_occurs = model.choice_groups_occurrences[nested_cg].second;
                                } else {
                                    ncn.min_occurs = 1;
                                    ncn.max_occurs = 1;
                                }
                                if (nested_cg < model.choice_groups_documentation.size()) {
                                    ncn.documentation = model.choice_groups_documentation[nested_cg];
                                }
                                if (nested_cg < model.choice_groups.size()) {
                                    std::unordered_map<std::string, ContentModelNode> nc_by_name;
                                    for (auto& nc : nested_collected)
                                        nc_by_name[nc.name] = std::move(nc);
                                    nested_collected.clear();
                                    for (const auto& nc_alt : model.choice_groups[nested_cg]) {
                                        auto nc_it = nc_by_name.find(nc_alt);
                                        if (nc_it != nc_by_name.end()) {
                                            ncn.children.push_back(std::move(nc_it->second));
                                            nc_by_name.erase(nc_it);
                                        }
                                    }
                                    for (auto& [_, nc_node] : nc_by_name)
                                        ncn.children.push_back(std::move(nc_node));
                                } else {
                                    for (auto& nc : nested_collected)
                                        ncn.children.push_back(std::move(nc));
                                    nested_collected.clear();
                                }
                                ApplyChoiceExclusion(ncn);
                                seq_node.children.push_back(std::move(ncn));
                                nested_cg = kNoGroup;
                            };

                            for (const auto& se : sg.elements) {
                                auto cg_it = local_elem_to_cg.find(se.name);
                                size_t se_cg = (cg_it != local_elem_to_cg.end()) ? cg_it->second : kNoGroup;
                                bool is_nested = (se_cg != kNoGroup && se_cg != parent_cg);

                                if (is_nested) {
                                    if (nested_cg != kNoGroup && se_cg != nested_cg) {
                                        flush_nested();
                                    }
                                    nested_cg = se_cg;
                                    nested_collected.push_back(MakeElementNode(se, counts));
                                } else {
                                    flush_nested();
                                    seq_node.children.push_back(MakeElementNode(se, counts));
                                }
                            }
                            flush_nested();

                            choice_node.children.push_back(std::move(seq_node));
                            break;
                        }
                    }
                } else {
                    // Single element alternative.
                    for (const auto& elem : model.elements) {
                        if (elem.name == name) {
                            choice_node.children.push_back(MakeElementNode(elem, counts));
                            break;
                        }
                    }
                }
            }
        } else {
            for (const auto& elem : model.elements) {
                choice_node.children.push_back(MakeElementNode(elem, counts));
            }
        }

        ApplyChoiceExclusion(choice_node);
        result.push_back(std::move(choice_node));
        return result;
    }

    // Sequence / all / mixed: use choice_groups to identify embedded choices.
    // Build lookup: element name → choice_group index.
    std::unordered_map<std::string, size_t> elem_to_cg;
    std::set<std::string> seq_group_reps;
    for (const auto& sg : model.sequence_groups) {
        if (!sg.elements.empty())
            seq_group_reps.insert(sg.elements[0].name);
    }
    for (size_t gi = 0; gi < model.choice_groups.size(); ++gi) {
        for (const auto& name : model.choice_groups[gi]) {
            elem_to_cg[name] = gi;
            // If this name is a sequence-group representative, map all member elements too.
            if (seq_group_reps.count(name)) {
                for (const auto& sg : model.sequence_groups) {
                    if (!sg.elements.empty() && sg.elements[0].name == name) {
                        for (const auto& se : sg.elements) {
                            elem_to_cg[se.name] = gi;
                        }
                        break;
                    }
                }
            }
        }
    }

    // Collect elements belonging to the current choice group, then flush as one choice node.
    size_t current_cg = kNoGroup;
    std::vector<ContentModelNode> collected;  // element nodes collected for the pending group

    auto flush_choice_group = [&]() {
        if (current_cg == kNoGroup || collected.empty())
            return;
        // Build the choice node using choice_groups ordering.
        ContentModelNode cn;
        cn.node_type = "choice";
        if (current_cg < model.choice_groups_occurrences.size()) {
            cn.min_occurs = model.choice_groups_occurrences[current_cg].first;
            cn.max_occurs = model.choice_groups_occurrences[current_cg].second;
        } else {
            cn.min_occurs = 1;  // XSD default: minOccurs=1 when not specified
            cn.max_occurs = 1;
        }
        if (current_cg < model.choice_groups_documentation.size()) {
            cn.documentation = model.choice_groups_documentation[current_cg];
        }
        const auto& group = model.choice_groups[current_cg];
        // Index collected nodes by name for fast lookup.
        std::unordered_map<std::string, ContentModelNode> by_name;
        for (auto& c : collected)
            by_name[c.name] = std::move(c);
        collected.clear();

        for (const auto& alt_name : group) {
            if (seq_group_reps.count(alt_name)) {
                // Sequence-within-choice: build a sequence sub-node,
                // detecting nested choice groups within the sequence.
                for (const auto& sg : model.sequence_groups) {
                    if (!sg.elements.empty() && sg.elements[0].name == alt_name) {
                        ContentModelNode seq_node;
                        seq_node.node_type = "sequence";

                        size_t nested_cg = kNoGroup;
                        std::vector<ContentModelNode> nested_collected;

                        auto flush_nested_choice = [&]() {
                            if (nested_cg == kNoGroup || nested_collected.empty()) return;
                            ContentModelNode ncn;
                            ncn.node_type = "choice";
                            if (nested_cg < model.choice_groups_occurrences.size()) {
                                ncn.min_occurs = model.choice_groups_occurrences[nested_cg].first;
                                ncn.max_occurs = model.choice_groups_occurrences[nested_cg].second;
                            } else {
                                ncn.min_occurs = 1;
                                ncn.max_occurs = 1;
                            }
                            if (nested_cg < model.choice_groups_documentation.size()) {
                                ncn.documentation = model.choice_groups_documentation[nested_cg];
                            }
                            if (nested_cg < model.choice_groups.size()) {
                                std::unordered_map<std::string, ContentModelNode> nc_by_name;
                                for (auto& nc : nested_collected)
                                    nc_by_name[nc.name] = std::move(nc);
                                nested_collected.clear();
                                for (const auto& nc_alt : model.choice_groups[nested_cg]) {
                                    auto nc_it = nc_by_name.find(nc_alt);
                                    if (nc_it != nc_by_name.end()) {
                                        ncn.children.push_back(std::move(nc_it->second));
                                        nc_by_name.erase(nc_it);
                                    }
                                }
                                for (auto& [_, nc_node] : nc_by_name)
                                    ncn.children.push_back(std::move(nc_node));
                            } else {
                                for (auto& nc : nested_collected)
                                    ncn.children.push_back(std::move(nc));
                                nested_collected.clear();
                            }
                            ApplyChoiceExclusion(ncn);
                            seq_node.children.push_back(std::move(ncn));
                            nested_cg = kNoGroup;
                        };

                        // Build local elem→CG map without seq_group expansion for nested detection.
                        // The outer `elem_to_cg` is contaminated by seq_group_rep expansion
                        // (all sequence members map to the parent CG), making nested choices invisible.
                        std::unordered_map<std::string, size_t> local_cg;
                        for (size_t gi2 = 0; gi2 < model.choice_groups.size(); ++gi2) {
                            for (const auto& cg_name : model.choice_groups[gi2]) {
                                local_cg[cg_name] = gi2;
                            }
                        }

                        for (const auto& se : sg.elements) {
                            auto cg_it = local_cg.find(se.name);
                            size_t se_cg = (cg_it != local_cg.end()) ? cg_it->second : kNoGroup;
                            bool is_nested = (se_cg != kNoGroup && se_cg != current_cg);

                            if (is_nested) {
                                if (nested_cg != kNoGroup && se_cg != nested_cg) {
                                    flush_nested_choice();
                                }
                                nested_cg = se_cg;
                                auto elem_it = by_name.find(se.name);
                                if (elem_it != by_name.end()) {
                                    nested_collected.push_back(std::move(elem_it->second));
                                    by_name.erase(elem_it);
                                } else {
                                    nested_collected.push_back(MakeElementNode(se, counts));
                                }
                            } else {
                                flush_nested_choice();
                                auto elem_it = by_name.find(se.name);
                                if (elem_it != by_name.end()) {
                                    seq_node.children.push_back(std::move(elem_it->second));
                                    by_name.erase(elem_it);
                                } else {
                                    seq_node.children.push_back(MakeElementNode(se, counts));
                                }
                            }
                        }
                        flush_nested_choice();

                        cn.children.push_back(std::move(seq_node));
                        break;
                    }
                }
            } else {
                auto it = by_name.find(alt_name);
                if (it != by_name.end()) {
                    cn.children.push_back(std::move(it->second));
                    by_name.erase(it);
                } else {
                    // Fallback: find in model.elements.
                    for (const auto& elem : model.elements) {
                        if (elem.name == alt_name) {
                            cn.children.push_back(MakeElementNode(elem, counts));
                            break;
                        }
                    }
                }
            }
        }
        ApplyChoiceExclusion(cn);
        result.push_back(std::move(cn));
        current_cg = kNoGroup;
    };

    for (const auto& elem : model.elements) {
        auto it = elem_to_cg.find(elem.name);
        if (it == elem_to_cg.end()) {
            // Not in any choice group — flush pending and emit as regular element.
            flush_choice_group();
            result.push_back(MakeElementNode(elem, counts));
        } else {
            size_t gi = it->second;
            if (current_cg != kNoGroup && gi != current_cg) {
                flush_choice_group();
            }
            current_cg = gi;
            collected.push_back(MakeElementNode(elem, counts));
        }
    }
    flush_choice_group();

    // Propagate repeatable sequence/all cardinality to top-level element nodes.
    // E.g. <xs:sequence maxOccurs="unbounded"><xs:element name="e" maxOccurs="1"/></xs:sequence>
    // means "e" can appear unlimited times (one per sequence repetition).
    if (model.max_occurs != 1) {
        for (auto& node : result) {
            if (node.node_type == "element") {
                if (model.max_occurs == kUnbounded) {
                    node.max_occurs = kUnbounded;
                } else if (node.max_occurs != kUnbounded) {
                    node.max_occurs *= model.max_occurs;
                }
                node.is_exhausted = (node.max_occurs != kUnbounded) && (node.current_count >= node.max_occurs);
                node.can_insert = !node.is_exhausted;
            }
        }
    }

    return result;
}

}  // namespace helper_tree
}  // namespace xve
