#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/helper_data_service_impl.h"
#include "xmlvisualeditor/services/schema_service.h"

#include <algorithm>
#include <map>
#include <string>
#include <unordered_map>
#include <vector>

#include "helper_data_navigation.h"
#include "helper_data_service_tree.h"

namespace xve {

using helper_nav::CountChildElements;
using helper_nav::NavigateToElement;
using helper_tree::BuildContentModelTree;
using helper_tree::CheckContentComplete;
using helper_tree::FindMissingRequired;

// ── Constructor ───────────────────────────────────────────────────────────

HelperDataServiceImpl::HelperDataServiceImpl(IDocumentService* doc_svc, ISchemaService* schema_svc)
    : document_service_(doc_svc), schema_service_(schema_svc) {}

// ── ComputeElementsPanelData ──────────────────────────────────────────────

auto HelperDataServiceImpl::ComputeElementsPanelData(const std::string& schema_id,
                                                     const std::string& element_name,
                                                     const std::vector<std::string>& element_path,
                                                     const std::string& doc_id) -> std::optional<ElementsPanelData> {
    // Use path-based resolution to get the correct content model for elements with name collisions.
    std::optional<ContentModelInfo> content_model;
    if (!element_path.empty()) {
        std::string resolved_type = schema_service_->ResolveElementTypeByPath(schema_id, element_path);
        if (!resolved_type.empty()) {
            content_model = schema_service_->GetContentModelByType(schema_id, resolved_type);
        }
    }
    if (!content_model) {
        content_model = schema_service_->GetContentModel(schema_id, element_name);
    }
    if (!content_model) {
        // Simple-type or unknown elements have no content model — return empty panel.
        ElementsPanelData data;
        data.anchor_element = element_name;
        data.anchor_path = element_path;
        data.content_complete = true;
        return data;
    }

    std::map<std::string, int> child_counts;
    if (!doc_id.empty()) {
        auto* doc = document_service_->GetDocument(doc_id);
        if (doc) {
            auto elem = NavigateToElement(doc, element_path);
            if (elem)
                child_counts = CountChildElements(elem);
        }
    }

    auto tree = BuildContentModelTree(*content_model, child_counts);

    ElementsPanelData data;
    data.anchor_element = element_name;
    data.anchor_path = element_path;
    data.content_model = std::move(tree);
    data.content_complete = CheckContentComplete(data.content_model);
    data.missing_required = FindMissingRequired(data.content_model);
    return data;
}

// ── ComputeAttributesPanelData ────────────────────────────────────────────

auto HelperDataServiceImpl::ComputeAttributesPanelData(const std::string& schema_id,
                                                       const std::string& element_name,
                                                       const std::vector<std::string>& element_path,
                                                       const std::string& doc_id)
    -> std::optional<AttributesPanelData> {
    // Use path-based resolution to get the correct attributes for elements with name collisions.
    std::string lookup_name = element_name;
    bool resolved_by_type = false;
    if (!element_path.empty()) {
        std::string resolved_type = schema_service_->ResolveElementTypeByPath(schema_id, element_path);
        if (!resolved_type.empty()) {
            lookup_name = resolved_type;
            resolved_by_type = true;
        }
    }
    auto schema_attrs = resolved_by_type
        ? schema_service_->GetAllowedAttributesByType(schema_id, lookup_name)
        : schema_service_->GetAllowedAttributes(schema_id, lookup_name);

    std::vector<std::pair<std::string, std::string>> doc_attrs;
    if (!doc_id.empty()) {
        auto* doc = document_service_->GetDocument(doc_id);
        if (doc) {
            auto elem = NavigateToElement(doc, element_path);
            if (elem)
                doc_attrs = elem.GetAttributes();
        }
    }

    AttributesPanelData data;
    data.element_name = element_name;

    // Look up element's min_occurs from schema.
    std::optional<ElementInfo> elem_info;
    if (!element_path.empty()) {
        elem_info = schema_service_->GetElementInfoByPath(schema_id, element_path);
    }
    if (!elem_info) {
        elem_info = schema_service_->GetElementInfo(schema_id, element_name);
    }
    if (elem_info) {
        data.min_occurs = elem_info->min_occurs;
    }

    for (const auto& [attr_name, attr_info] : schema_attrs) {
        AttributeInstanceInfo info;
        info.name = attr_info.name;
        info.type_name = attr_info.type_name;
        info.use = attr_info.use;
        info.default_value = attr_info.default_value;
        info.fixed_value = attr_info.fixed_value;
        info.documentation = attr_info.documentation;
        info.is_wildcard = attr_info.is_wildcard;
        info.namespace_constraint = attr_info.namespace_constraint;
        info.process_contents = attr_info.process_contents;

        for (const auto& [dn, dv] : doc_attrs) {
            if (dn == attr_name) {
                info.is_set = true;
                info.current_value = dv;
                break;
            }
        }

        if (!attr_info.type_name.empty()) {
            info.enum_values = schema_service_->GetEnumerationValues(schema_id, attr_info.type_name);
        }

        data.attributes.push_back(std::move(info));
    }

    std::sort(data.attributes.begin(),
              data.attributes.end(),
              [](const AttributeInstanceInfo& a, const AttributeInstanceInfo& b) {
                  if (a.use == "required" && b.use != "required")
                      return true;
                  if (a.use != "required" && b.use == "required")
                      return false;
                  return a.name < b.name;
              });

    return data;
}

// ── ComputeNodeDetails ────────────────────────────────────────────────────

auto HelperDataServiceImpl::ComputeNodeDetails(const std::string& schema_id,
                                               const std::string& element_name,
                                               const std::vector<std::string>& element_path,
                                               const std::string& doc_id) -> std::optional<NodeDetails> {
    // Use path-based resolution to get the correct ElementInfo for elements with name collisions.
    std::optional<ElementInfo> elem_info;
    if (!element_path.empty()) {
        elem_info = schema_service_->GetElementInfoByPath(schema_id, element_path);
    }
    if (!elem_info) {
        elem_info = schema_service_->GetElementInfo(schema_id, element_name);
    }
    if (!elem_info)
        return std::nullopt;

    NodeDetails details;
    details.name = elem_info->name;
    details.type_name = elem_info->type_name;
    details.documentation = elem_info->documentation;
    details.min_occurs = elem_info->min_occurs;
    details.max_occurs = elem_info->max_occurs;

    // Enumeration values, restriction facets, and appinfo
    details.appinfo = elem_info->appinfo;
    if (!elem_info->type_name.empty()) {
        details.enum_values = schema_service_->GetEnumerationValues(schema_id, elem_info->type_name);
        auto type_info = schema_service_->GetTypeInfo(schema_id, elem_info->type_name);
        if (type_info) {
            details.restrictions = type_info->restrictions;
            if (details.appinfo.empty()) {
                details.appinfo = type_info->appinfo;
            }
        }
    }

    if (!element_path.empty()) {
        std::string xpath = "/";
        for (size_t i = 0; i < element_path.size(); ++i) {
            if (i > 0)
                xpath += "/";
            xpath += element_path[i];
        }
        details.xpath = xpath;
    }

    // Instance state and compositor context require parent info.
    if (!doc_id.empty() && element_path.size() >= 2) {
        auto* doc = document_service_->GetDocument(doc_id);
        if (doc) {
            std::vector<std::string> parent_path(element_path.begin(), element_path.end() - 1);
            auto parent = NavigateToElement(doc, parent_path);
            if (parent) {
                auto parent_name = parent.Name();
                // Use path-based resolution for parent content model.
                std::optional<ContentModelInfo> parent_model;
                if (!parent_path.empty()) {
                    std::string parent_type =
                        schema_service_->ResolveElementTypeByPath(schema_id, parent_path);
                    if (!parent_type.empty()) {
                        parent_model = schema_service_->GetContentModel(schema_id, parent_type);
                    }
                }
                if (!parent_model) {
                    parent_model = schema_service_->GetContentModel(schema_id, parent_name);
                }
                if (parent_model) {
                    auto child_counts = CountChildElements(parent);

                    // Instance state
                    InstanceState state;
                    auto count_it = child_counts.find(element_name);
                    state.current_count = (count_it != child_counts.end()) ? count_it->second : 0;
                    state.is_satisfied = state.current_count >= elem_info->min_occurs;

                    // Compute effective max_occurs, accounting for choice group repetition.
                    int effective_max = elem_info->max_occurs;
                    if (effective_max != kUnbounded && parent_model) {
                        for (size_t gi = 0; gi < parent_model->choice_groups.size(); ++gi) {
                            bool in_group = false;
                            for (const auto& member : parent_model->choice_groups[gi]) {
                                if (member == element_name) {
                                    in_group = true;
                                    break;
                                }
                            }
                            if (!in_group) {
                                for (const auto& sg : parent_model->sequence_groups) {
                                    for (const auto& se : sg.elements) {
                                        if (se.name == element_name) {
                                            for (const auto& member : parent_model->choice_groups[gi]) {
                                                if (member == sg.choice_path) {
                                                    in_group = true;
                                                    break;
                                                }
                                            }
                                            break;
                                        }
                                    }
                                    if (in_group) break;
                                }
                            }
                            if (in_group && gi < parent_model->choice_groups_occurrences.size()) {
                                int choice_max = parent_model->choice_groups_occurrences[gi].second;
                                if (choice_max == kUnbounded) {
                                    effective_max = kUnbounded;
                                } else if (choice_max > 1) {
                                    effective_max = elem_info->max_occurs * choice_max;
                                }
                                break;
                            }
                        }
                    }

                    // Also account for repeatable parent sequence/all compositor
                    if (effective_max != kUnbounded && parent_model &&
                        (parent_model->model_type == "sequence" || parent_model->model_type == "all") &&
                        parent_model->max_occurs != 1) {
                        if (parent_model->max_occurs == kUnbounded) {
                            effective_max = kUnbounded;
                        } else {
                            effective_max = effective_max * parent_model->max_occurs;
                        }
                    }

                    // Update details.max_occurs so the Info panel displays the effective value
                    details.max_occurs = effective_max;

                    state.is_exhausted =
                        (effective_max != kUnbounded) && (state.current_count >= effective_max);
                    state.can_insert = !state.is_exhausted;

                    // Compute content_complete for the SELECTED element's own content model.
                    // Use the resolved type_name from elem_info for correct lookup.
                    std::optional<ContentModelInfo> self_model;
                    if (!elem_info->type_name.empty()) {
                        self_model = schema_service_->GetContentModel(schema_id, elem_info->type_name);
                    }
                    if (!self_model) {
                        self_model = schema_service_->GetContentModel(schema_id, element_name);
                    }
                    if (self_model) {
                        auto self_elem = NavigateToElement(doc, element_path);
                        if (self_elem) {
                            auto self_child_counts = CountChildElements(self_elem);
                            auto self_tree = BuildContentModelTree(*self_model, self_child_counts);
                            state.content_complete = CheckContentComplete(self_tree);
                            state.missing_required = FindMissingRequired(self_tree);
                        } else {
                            state.content_complete = false;
                        }
                    } else {
                        // Simple/empty type — content complete by definition
                        state.content_complete = true;
                    }
                    details.instance_state = state;

                    // Compositor context
                    CompositorContext ctx;
                    ctx.parent_element = parent_name;
                    ctx.parent_compositor = parent_model->model_type;

                    std::string target_choice_path;
                    bool found = false;
                    for (const auto& me : parent_model->elements) {
                        if (me.name == element_name) {
                            target_choice_path = me.choice_path;
                            found = true;
                            break;
                        }
                    }

                    if (found) {
                        bool before = true;
                        for (const auto& me : parent_model->elements) {
                            if (me.name == element_name) {
                                before = false;
                                continue;
                            }
                            if (before) {
                                ctx.preceding_siblings.push_back(me.name);
                            } else {
                                ctx.following_siblings.push_back(me.name);
                            }
                        }
                        if (!target_choice_path.empty()) {
                            for (const auto& me : parent_model->elements) {
                                if (me.choice_path == target_choice_path && me.name != element_name) {
                                    ctx.choice_alternatives.push_back(me.name);
                                }
                            }
                        }
                    }

                    details.compositor_context = ctx;
                }
            }
        }
    }

    return details;
}

}  // namespace xve
