#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/helper_data_service_impl.h"
#include "xmlvisualeditor/services/schema_service.h"

#include <functional>
#include <map>
#include <set>
#include <string>
#include <unordered_map>
#include <vector>

#include "helper_data_navigation.h"

namespace xve {
namespace {

using helper_nav::CountChildElements;
using helper_nav::NavigateToElement;

// ── Dummy value helper for InsertRequiredChildren ─────────────────────────

auto GetDummyValue(const std::string& type_name) -> std::string {
    std::string local = type_name;
    auto colon = local.find(':');
    if (colon != std::string::npos)
        local = local.substr(colon + 1);

    static const std::unordered_map<std::string, std::string> kDummyMap = {
        {"string", "a"},
        {"normalizedString", "a"},
        {"token", "a"},
        {"integer", "0"},
        {"int", "0"},
        {"long", "0"},
        {"short", "0"},
        {"byte", "0"},
        {"nonNegativeInteger", "0"},
        {"unsignedInt", "0"},
        {"unsignedLong", "0"},
        {"unsignedShort", "0"},
        {"positiveInteger", "1"},
        {"float", "0.0"},
        {"double", "0.0"},
        {"decimal", "0.0"},
        {"boolean", "true"},
        {"date", ""},
        {"dateTime", ""},
        {"time", ""},
        {"anyURI", ""},
        {"anyType", "a"},
    };

    auto it = kDummyMap.find(local);
    return (it != kDummyMap.end()) ? it->second : "a";
}

}  // namespace

// ── InsertRequiredChildren ────────────────────────────────────────────────

auto HelperDataServiceImpl::InsertRequiredChildren(const std::string& doc_id,
                                                   const std::string& schema_id,
                                                   const std::vector<std::string>& element_path)
    -> InsertRequiredResult {
    InsertRequiredResult result;
    if (doc_id.empty() || element_path.empty()) {
        return result;
    }

    auto* doc = document_service_->GetDocument(doc_id);
    if (!doc) {
        return result;
    }

    auto target = NavigateToElement(doc, element_path);
    if (!target) {
        return result;
    }

    constexpr int kMaxDepth = 5;

    auto set_required_attrs = [&](Element& elem, const std::string& elem_name, const std::string& type_hint = "") {
        auto attrs = !type_hint.empty()
                         ? schema_service_->GetAllowedAttributesByType(schema_id, type_hint)
                         : schema_service_->GetAllowedAttributes(schema_id, elem_name);
        for (const auto& [attr_name, attr_info] : attrs) {
            if (attr_info.use != "required")
                continue;
            if (elem.HasAttribute(attr_name))
                continue;
            std::string value;
            if (!attr_info.type_name.empty()) {
                auto enums = schema_service_->GetEnumerationValues(schema_id, attr_info.type_name);
                if (!enums.empty()) {
                    value = enums[0];
                } else if (!attr_info.default_value.empty()) {
                    value = attr_info.default_value;
                } else {
                    value = GetDummyValue(attr_info.type_name);
                }
            } else if (!attr_info.default_value.empty()) {
                value = attr_info.default_value;
            }
            elem.SetAttribute(attr_name, value);
        }
    };

    auto get_element_text_value = [&](const std::string& elem_name, const std::string& type_hint = "") -> std::string {
        // If type_hint is provided, use it directly; otherwise fall back to name-only lookup.
        std::string resolved_type = type_hint;
        if (resolved_type.empty()) {
            auto info = schema_service_->GetElementInfo(schema_id, elem_name);
            resolved_type = info ? info->type_name : "";
        }

        // Check if it's a complex type (has child elements).
        if (!resolved_type.empty()) {
            auto model = schema_service_->GetContentModelByType(schema_id, resolved_type);
            if (model && !model->elements.empty())
                return "";  // Complex type — no text.
        } else {
            auto model = schema_service_->GetContentModel(schema_id, elem_name);
            if (model && !model->elements.empty())
                return "";
        }

        if (!resolved_type.empty()) {
            auto enums = schema_service_->GetEnumerationValues(schema_id, resolved_type);
            if (!enums.empty())
                return enums[0];
        }

        if (!resolved_type.empty())
            return GetDummyValue(resolved_type);
        return "a";
    };

    // fill_required recursively inserts required elements into `parent`.
    // After recursion, ensure_expanded forces expanded serialization for empty
    // elements that have no required attributes.
    std::function<void(Element&, const std::string&, const std::string&, const std::vector<std::string>&, int)>
        fill_required;
    fill_required = [&](Element& parent,
                        const std::string& parent_name,
                        const std::string& type_hint,
                        const std::vector<std::string>& parent_path_vec,
                        int depth) {
        if (depth > kMaxDepth)
            return;

        set_required_attrs(parent, parent_name, type_hint);

        auto model = !type_hint.empty()
                         ? schema_service_->GetContentModelByType(schema_id, type_hint)
                         : std::optional<ContentModelInfo>{};
        if (!model) {
            model = schema_service_->GetContentModel(schema_id, parent_name);
        }
        if (!model || model->model_type == "empty" || model->model_type == "simple") {
            if (!model || model->model_type == "simple") {
                if (parent.Text().empty()) {
                    auto text = get_element_text_value(parent_name, type_hint);
                    if (!text.empty())
                        parent.SetText(text);
                }
            }
            return;
        }

        auto child_counts = CountChildElements(parent);

        // If the content model's root compositor is optional (minOccurs=0) and no children
        // from it exist yet, skip all element insertion.  This mirrors the validator's
        // skip_min_occurs logic and handles <sequence minOccurs="0"> wrapping required elements.
        if (model->min_occurs == 0) {
            bool any_present = false;
            for (const auto& elem : model->elements) {
                auto it = child_counts.find(elem.name);
                if (it != child_counts.end() && it->second > 0) {
                    any_present = true;
                    break;
                }
            }
            if (!any_present)
                return;
        }

        if (model->model_type == "choice") {
            // For choice: if min_occurs > 0 and nothing chosen yet, pick first alternative.
            int total_choice = 0;
            for (const auto& elem : model->elements) {
                auto it = child_counts.find(elem.name);
                if (it != child_counts.end())
                    total_choice += it->second;
            }
            if (model->min_occurs > 0 && total_choice == 0 && !model->elements.empty()) {
                const auto& first = model->elements[0];
                auto new_child = parent.AppendChild(first.name);
                auto child_path = parent_path_vec;
                child_path.push_back(first.name);
                result.inserted.push_back({first.name, child_path, depth});
                result.total_inserted++;
                fill_required(new_child, first.name, first.type_name, child_path, depth + 1);
            }
        } else {
            // sequence / all / mixed: single-pass in schema order with inline choice handling.
            // Build lookup: element name → choice_group index.
            std::unordered_map<std::string, size_t> elem_to_cg;
            std::set<std::string> seq_group_reps;
            for (const auto& sg : model->sequence_groups)
                if (!sg.elements.empty()) seq_group_reps.insert(sg.elements[0].name);
            for (size_t gi = 0; gi < model->choice_groups.size(); ++gi) {
                for (const auto& name : model->choice_groups[gi]) {
                    elem_to_cg[name] = gi;
                    if (!seq_group_reps.count(name)) continue;
                    for (const auto& sg : model->sequence_groups)
                        if (!sg.elements.empty() && sg.elements[0].name == name) {
                            for (const auto& se : sg.elements) elem_to_cg[se.name] = gi;
                            break;
                        }
                }
            }
            auto is_choice_required = [&](size_t gi) -> bool {
                if (gi < model->choice_groups_occurrences.size())
                    return model->choice_groups_occurrences[gi].first > 0;
                for (const auto& name : model->choice_groups[gi])
                    for (const auto& e : model->elements)
                        if (e.name == name && e.min_occurs > 0) return true;
                return false;
            };
            // Handle nested choices within a sequence, optionally inserting non-choice elements.
            auto do_nested_choices = [&](const auto& sg_elems, size_t pgi, bool ins_reg) {
                std::unordered_map<std::string, size_t> rcg;
                for (size_t i = 0; i < model->choice_groups.size(); ++i)
                    for (const auto& n : model->choice_groups[i]) rcg[n] = i;
                std::set<size_t> done;
                for (const auto& se : sg_elems) {
                    if (auto ri = rcg.find(se.name); ri != rcg.end() && ri->second != pgi) {
                        auto ngi = ri->second;
                        if (done.count(ngi)) continue;
                        done.insert(ngi);
                        int cnt = 0;
                        for (const auto& c : model->choice_groups[ngi])
                            if (auto ci = child_counts.find(c); ci != child_counts.end()) cnt += ci->second;
                        if (cnt > 0 || ngi >= model->choice_groups_occurrences.size()
                            || model->choice_groups_occurrences[ngi].first <= 0)
                            continue;
                        for (const auto& e : model->elements) {
                            if (e.name != model->choice_groups[ngi][0]) continue;
                            auto ch = parent.AppendChild(e.name);
                            auto cp = parent_path_vec;
                            cp.push_back(e.name);
                            result.inserted.push_back({e.name, cp, depth});
                            result.total_inserted++;
                            child_counts[e.name]++;
                            fill_required(ch, e.name, e.type_name, cp, depth + 1);
                            break;
                        }
                    } else if (ins_reg && se.min_occurs > 0) {
                        auto ch = parent.AppendChild(se.name);
                        auto cp = parent_path_vec;
                        cp.push_back(se.name);
                        result.inserted.push_back({se.name, cp, depth});
                        result.total_inserted++;
                        fill_required(ch, se.name, se.type_name, cp, depth + 1);
                    }
                }
            };
            // Single pass: walk elements in schema order, handle choices inline.
            std::set<size_t> processed_groups;
            for (const auto& elem : model->elements) {
                auto cg_it = elem_to_cg.find(elem.name);
                if (cg_it == elem_to_cg.end()) {
                    // Regular (non-choice) element.
                    if (elem.min_occurs <= 0)
                        continue;
                    auto it = child_counts.find(elem.name);
                    int current = (it != child_counts.end()) ? it->second : 0;
                    int needed = elem.min_occurs - current;
                    for (int n = 0; n < needed; ++n) {
                        auto new_child = parent.AppendChild(elem.name);
                        int idx = current + n + 1;
                        auto child_path = parent_path_vec;
                        child_path.push_back(idx > 1 ? elem.name + "[" + std::to_string(idx) + "]" : elem.name);
                        result.inserted.push_back({elem.name, child_path, depth});
                        result.total_inserted++;
                        fill_required(new_child, elem.name, elem.type_name, child_path, depth + 1);
                    }
                } else {
                    // Element in a choice group — process the group once.
                    size_t gi = cg_it->second;
                    if (processed_groups.count(gi))
                        continue;
                    processed_groups.insert(gi);

                    int total_choice = 0;
                    for (const auto& name : model->choice_groups[gi]) {
                        if (auto it = child_counts.find(name); it != child_counts.end())
                            total_choice += it->second;
                        for (const auto& sg : model->sequence_groups)
                            if (!sg.elements.empty() && sg.elements[0].name == name)
                                for (const auto& se : sg.elements)
                                    if (auto s = child_counts.find(se.name); s != child_counts.end())
                                        total_choice += s->second;
                    }

                    if (total_choice > 0) {
                        // Satisfied; check for nested choices in active sequence branch.
                        for (const auto& alt : model->choice_groups[gi]) {
                            if (!seq_group_reps.count(alt)) continue;
                            for (const auto& sg : model->sequence_groups) {
                                if (sg.elements.empty() || sg.elements[0].name != alt) continue;
                                bool active = false;
                                for (const auto& se : sg.elements)
                                    if (child_counts.count(se.name) && child_counts[se.name] > 0)
                                        { active = true; break; }
                                if (active) do_nested_choices(sg.elements, gi, false);
                                break;
                            }
                        }
                        continue;
                    }
                    if (model->choice_groups[gi].empty()) continue;

                    // Only insert if choice is required.
                    if (!is_choice_required(gi))
                        continue;

                    // Pick first alternative.
                    const auto& first_alt = model->choice_groups[gi][0];
                    bool is_seq = false;
                    for (const auto& sg : model->sequence_groups) {
                        if (!sg.elements.empty() && sg.elements[0].name == first_alt) {
                            is_seq = true;
                            do_nested_choices(sg.elements, gi, true);
                            break;
                        }
                    }
                    if (!is_seq) {
                        for (const auto& e : model->elements) {
                            if (e.name == first_alt) {
                                auto new_child = parent.AppendChild(e.name);
                                auto child_path = parent_path_vec;
                                child_path.push_back(e.name);
                                result.inserted.push_back({e.name, child_path, depth});
                                result.total_inserted++;
                                fill_required(new_child, e.name, e.type_name, child_path, depth + 1);
                                break;
                            }
                        }
                    }
                }
            }
        }

        // Recurse into existing children that may have unsatisfied requirements.
        std::map<std::string, int> visit_counts;
        for (const auto& child : parent.Children()) {
            std::string child_name = child.Name();
            visit_counts[child_name]++;
            int idx = visit_counts[child_name];
            auto child_path = parent_path_vec;
            child_path.push_back(idx > 1 ? child_name + "[" + std::to_string(idx) + "]" : child_name);
            // Look up type from current content model.
            std::string child_type;
            if (model) {
                for (const auto& me : model->elements) {
                    if (me.name == child_name) {
                        child_type = me.type_name;
                        break;
                    }
                }
            }
            auto mut_child = child;  // Element is a handle, safe to copy.
            fill_required(mut_child, child_name, child_type, child_path, depth + 1);
        }
    };

    // Derive type hint for the target element from its parent's content model.
    std::string target_type;
    if (element_path.size() >= 2) {
        auto parent_segment = element_path[element_path.size() - 2];
        auto bracket = parent_segment.find('[');
        auto parent_elem_name =
            (bracket != std::string::npos) ? parent_segment.substr(0, bracket) : parent_segment;
        auto parent_model = schema_service_->GetContentModel(schema_id, parent_elem_name);
        if (parent_model) {
            auto target_segment = element_path.back();
            auto tbracket = target_segment.find('[');
            auto target_elem_name =
                (tbracket != std::string::npos) ? target_segment.substr(0, tbracket) : target_segment;
            for (const auto& elem : parent_model->elements) {
                if (elem.name == target_elem_name) {
                    target_type = elem.type_name;
                    break;
                }
            }
        }
    }
    fill_required(target, target.Name(), target_type, element_path, 0);

    result.success = true;
    result.new_content = doc->ToString(true, "    ", true);
    return result;
}

}  // namespace xve
