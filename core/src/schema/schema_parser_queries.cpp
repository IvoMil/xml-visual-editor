#include "xmlvisualeditor/schema/schema_parser.h"

namespace xve {

// ============================================================================
// Query methods
// ============================================================================

auto SchemaParser::GetTargetNamespace() const -> std::string {
    return target_namespace_;
}

auto SchemaParser::GetRootElements() const -> std::vector<std::string> {
    return root_elements_;
}

auto SchemaParser::GetElementInfo(const std::string& element_name) const -> std::optional<ElementInfo> {
    if (auto it = element_cache_.find(element_name); it != element_cache_.end())
        return it->second;
    return std::nullopt;
}

auto SchemaParser::GetDocumentation(const std::string& element_name) const -> std::string {
    if (auto it = element_cache_.find(element_name); it != element_cache_.end()) {
        return it->second.documentation;
    }
    return {};
}

auto SchemaParser::GetTypeInfo(const std::string& type_name) const -> std::optional<TypeInfo> {
    if (auto it = type_cache_.find(type_name); it != type_cache_.end())
        return it->second;
    return std::nullopt;
}

auto SchemaParser::GetEnumerationValues(const std::string& type_name) const -> std::vector<std::string> {
    if (auto it = type_cache_.find(type_name); it != type_cache_.end())
        return it->second.enumerations;
    // Trigger lazy type resolution — type may exist in type_nodes_ but not yet processed.
    const_cast<SchemaParser*>(this)->EnsureTypeProcessed(type_name);
    if (auto it = type_cache_.find(type_name); it != type_cache_.end())
        return it->second.enumerations;
    return {};
}

auto SchemaParser::GetContentModel(const std::string& element_name) const -> std::optional<ContentModelInfo> {
    // Direct match (element with inline type stored under element name).
    if (auto it = content_model_cache_.find(element_name); it != content_model_cache_.end()) {
        return it->second;
    }
    // Fall back to the element's referenced type name.
    if (auto elem_it = element_cache_.find(element_name); elem_it != element_cache_.end()) {
        if (!elem_it->second.type_name.empty()) {
            if (auto it = content_model_cache_.find(elem_it->second.type_name); it != content_model_cache_.end()) {
                return it->second;
            }
        }
    }
    return std::nullopt;
}

auto SchemaParser::GetAllowedChildren(const std::string& element_name) const -> std::vector<std::string> {
    auto model = GetContentModel(element_name);
    if (!model)
        return {};
    std::vector<std::string> names;
    names.reserve(model->elements.size());
    for (const auto& elem : model->elements) {
        names.push_back(elem.name);
    }
    return names;
}

auto SchemaParser::GetOrderedChildren(const std::string& element_name) const -> std::vector<ElementInfo> {
    auto model = GetContentModel(element_name);
    if (!model)
        return {};
    return model->elements;
}

auto SchemaParser::GetAllowedAttributes(const std::string& element_name) const
    -> std::unordered_map<std::string, AttributeInfo> {
    if (auto it = attribute_cache_.find(element_name); it != attribute_cache_.end())
        return it->second;
    // Fall back to the element's referenced type name.
    if (auto elem_it = element_cache_.find(element_name); elem_it != element_cache_.end()) {
        if (!elem_it->second.type_name.empty()) {
            if (auto it = attribute_cache_.find(elem_it->second.type_name); it != attribute_cache_.end()) {
                return it->second;
            }
        }
    }
    return {};
}

auto SchemaParser::GetAllowedAttributesByType(const std::string& type_name) const
    -> std::unordered_map<std::string, AttributeInfo> {
    if (auto it = attribute_cache_.find(type_name); it != attribute_cache_.end())
        return it->second;
    return {};
}

auto SchemaParser::GetContentModelByType(const std::string& type_name) const -> std::optional<ContentModelInfo> {
    if (auto it = content_model_cache_.find(type_name); it != content_model_cache_.end())
        return it->second;
    return std::nullopt;
}

// ============================================================================
// Path-based resolution
// ============================================================================

auto SchemaParser::ResolveElementTypeByPath(const std::vector<std::string>& element_path) const -> std::string {
    if (element_path.empty())
        return {};

    // Strip index suffix from path segments, e.g. "gridPlotGroup[19]" -> "gridPlotGroup".
    auto stripIndex = [](const std::string& s) -> std::string {
        auto pos = s.find('[');
        return (pos != std::string::npos) ? s.substr(0, pos) : s;
    };

    // Start with the first element (root) from element_cache_.
    auto root_it = element_cache_.find(stripIndex(element_path[0]));
    if (root_it == element_cache_.end())
        return {};

    std::string current_type = root_it->second.type_name;

    // Walk subsequent path segments through content models.
    for (size_t i = 1; i < element_path.size(); ++i) {
        std::string segment = stripIndex(element_path[i]);

        // Find the content model for the current type (or element name for inline types).
        std::optional<ContentModelInfo> model;
        if (auto it = content_model_cache_.find(current_type); it != content_model_cache_.end()) {
            model = it->second;
        }
        if (!model)
            return {};

        // Search for the next segment in the content model's elements.
        bool found = false;
        for (const auto& elem : model->elements) {
            if (elem.name == segment) {
                current_type = elem.type_name;
                // Populate element_cache_ for elements resolved along the way.
                if (!elem.name.empty() && !element_cache_.contains(elem.name)) {
                    element_cache_[elem.name] = elem;
                }
                found = true;
                break;
            }
        }
        if (!found)
            return {};
    }

    return current_type;
}

auto SchemaParser::GetElementInfoByPath(const std::vector<std::string>& element_path) const
    -> std::optional<ElementInfo> {
    if (element_path.empty())
        return std::nullopt;

    // Strip index suffix from path segments, e.g. "gridPlotGroup[19]" -> "gridPlotGroup".
    auto stripIndex = [](const std::string& s) -> std::string {
        auto pos = s.find('[');
        return (pos != std::string::npos) ? s.substr(0, pos) : s;
    };

    // Single-element path: return from element_cache_ directly.
    if (element_path.size() == 1) {
        return GetElementInfo(stripIndex(element_path[0]));
    }

    // Walk to the parent, then find the target element in the parent's content model.
    auto root_it = element_cache_.find(stripIndex(element_path[0]));
    if (root_it == element_cache_.end())
        return std::nullopt;

    std::string current_type = root_it->second.type_name;

    // Walk to the parent of the target element.
    for (size_t i = 1; i + 1 < element_path.size(); ++i) {
        std::string segment = stripIndex(element_path[i]);
        std::optional<ContentModelInfo> model;
        if (auto it = content_model_cache_.find(current_type); it != content_model_cache_.end()) {
            model = it->second;
        }
        if (!model)
            return std::nullopt;

        bool found = false;
        for (const auto& elem : model->elements) {
            if (elem.name == segment) {
                current_type = elem.type_name;
                found = true;
                break;
            }
        }
        if (!found)
            return std::nullopt;
    }

    // Now current_type is the parent's type. Find the target element in its content model.
    std::string target_name = stripIndex(element_path.back());
    if (auto it = content_model_cache_.find(current_type); it != content_model_cache_.end()) {
        for (const auto& elem : it->second.elements) {
            if (elem.name == target_name) {
                return elem;
            }
        }
    }

    return std::nullopt;
}

}  // namespace xve
