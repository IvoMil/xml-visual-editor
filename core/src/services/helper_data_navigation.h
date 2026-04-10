#pragma once

// Internal header: shared path-navigation utilities for HelperDataService implementation files.
// Not part of the public API.

#include "xmlvisualeditor/core/document.h"

#include <map>
#include <string>
#include <vector>

namespace xve {
namespace helper_nav {

struct PathSegment {
    std::string name;
    int index = 1;  // 1-based
};

inline auto ParsePathSegment(const std::string& segment) -> PathSegment {
    auto bracket = segment.find('[');
    if (bracket == std::string::npos)
        return {segment, 1};
    auto close = segment.find(']', bracket);
    if (close == std::string::npos)
        return {segment.substr(0, bracket), 1};
    try {
        return {segment.substr(0, bracket), std::stoi(segment.substr(bracket + 1, close - bracket - 1))};
    } catch (...) {
        return {segment.substr(0, bracket), 1};
    }
}

inline auto NavigateToElement(Document* doc, const std::vector<std::string>& path) -> Element {
    if (!doc || path.empty())
        return {};
    Element current = doc->Root();
    if (!current)
        return {};

    size_t start = 0;
    if (current.Name() == ParsePathSegment(path[0]).name) {
        start = 1;
    }

    for (size_t i = start; i < path.size(); ++i) {
        auto [name, index] = ParsePathSegment(path[i]);
        auto children = current.ChildrenByName(name);
        if (index < 1 || index > static_cast<int>(children.size()))
            return {};
        current = children[index - 1];
    }
    return current;
}

inline auto CountChildElements(const Element& parent) -> std::map<std::string, int> {
    std::map<std::string, int> counts;
    if (!parent)
        return counts;
    for (const auto& child : parent.Children()) {
        counts[child.Name()]++;
    }
    return counts;
}

}  // namespace helper_nav
}  // namespace xve
