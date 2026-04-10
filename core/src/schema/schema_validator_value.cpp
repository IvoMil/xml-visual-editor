#include "xmlvisualeditor/schema/schema_validator.h"

#include "xmlvisualeditor/schema/schema_types.h"
#include "xmlvisualeditor/services/schema_service.h"

#include <algorithm>
#include <regex>
#include <sstream>

namespace xve {

// ============================================================================
// Recursive union value checking
// ============================================================================

bool SchemaValidator::CheckUnionValue(const std::string& text, const TypeInfo& union_type, int depth) {
    static constexpr int kMaxUnionDepth = 10;
    if (depth >= kMaxUnionDepth) {
        return true;  // Depth limit — be permissive.
    }
    for (const auto& member_name : union_type.member_types) {
        auto member = schema_service_.GetTypeInfo(schema_id_, member_name);
        if (!member) {
            return true;  // Unknown member type — be permissive.
        }
        if (member->base_type == "union" && !member->member_types.empty()) {
            if (CheckUnionValue(text, *member, depth + 1)) {
                return true;
            }
            continue;
        }
        if (member->enumerations.empty() && !member->restrictions.pattern) {
            return true;  // No enumerations and no pattern — accepts any string.
        }
        if (!member->enumerations.empty()) {
            if (std::find(member->enumerations.begin(), member->enumerations.end(), text) !=
                member->enumerations.end()) {
                return true;
            }
        }
        if (member->restrictions.pattern) {
            try {
                std::regex re(*member->restrictions.pattern);
                if (std::regex_match(text, re)) {
                    return true;
                }
            } catch (const std::regex_error&) {
                return true;  // Bad pattern — be permissive.
            }
        }
    }
    return false;
}

// ============================================================================
// Text content validation
// ============================================================================

void SchemaValidator::ValidateTextContent(const Element& element, const std::string& element_name,
                                          const std::vector<std::string>& element_path) {
    std::optional<ElementInfo> elem_info;
    if (element_path.size() > 1) {
        elem_info = schema_service_.GetElementInfoByPath(schema_id_, element_path);
    }
    if (!elem_info) {
        elem_info = schema_service_.GetElementInfo(schema_id_, element_name);
    }
    if (!elem_info || elem_info->type_name.empty()) {
        return;
    }

    auto type_info = schema_service_.GetTypeInfo(schema_id_, elem_info->type_name);
    if (!type_info || !type_info->is_simple) {
        return;
    }

    std::string text = element.Text();
    if (text.empty()) {
        return;  // Allow empty text (may be optional content)
    }

    // Check enumeration / union values
    if (type_info->base_type == "union" && !type_info->member_types.empty()) {
        bool accepted = CheckUnionValue(text, *type_info);
        if (!accepted) {
            std::ostringstream msg;
            msg << "Value '" << text << "' is not allowed for element '" << element_name << "'. Allowed values: [";
            for (size_t i = 0; i < type_info->enumerations.size(); ++i) {
                if (i > 0)
                    msg << ", ";
                msg << type_info->enumerations[i];
            }
            msg << "]";
            AddDiagnostic(element, msg.str());
        }
    } else if (!type_info->enumerations.empty()) {
        auto it = std::find(type_info->enumerations.begin(), type_info->enumerations.end(), text);
        if (it == type_info->enumerations.end()) {
            std::ostringstream msg;
            msg << "Value '" << text << "' is not allowed for element '" << element_name << "'. Allowed values: [";
            for (size_t i = 0; i < type_info->enumerations.size(); ++i) {
                if (i > 0)
                    msg << ", ";
                msg << type_info->enumerations[i];
            }
            msg << "]";
            AddDiagnostic(element, msg.str());
        }
    }

    // Check string length restrictions
    const auto& restr = type_info->restrictions;
    if (restr.min_length && static_cast<int>(text.size()) < *restr.min_length) {
        std::ostringstream msg;
        msg << "Value of element '" << element_name << "' is too short (minLength=" << *restr.min_length
            << ", actual=" << text.size() << ")";
        AddDiagnostic(element, msg.str());
    }
    if (restr.max_length && static_cast<int>(text.size()) > *restr.max_length) {
        std::ostringstream msg;
        msg << "Value of element '" << element_name << "' is too long (maxLength=" << *restr.max_length
            << ", actual=" << text.size() << ")";
        AddDiagnostic(element, msg.str());
    }
}

}  // namespace xve
