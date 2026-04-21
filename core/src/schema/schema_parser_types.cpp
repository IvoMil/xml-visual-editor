#include "xmlvisualeditor/schema/schema_parser.h"

#include <charconv>
#include <sstream>

namespace xve {

// ============================================================================
// Complex type processing
// ============================================================================

void SchemaParser::ProcessComplexType(pugi::xml_node type_node, const std::string& context_name) {
    if (processing_types_.contains(context_name))
        return;
    processing_types_.insert(context_name);

    TypeInfo type_info;
    type_info.name = context_name;
    type_info.is_complex = true;
    type_info.documentation = ExtractDocumentation(type_node);
    type_info.appinfo = ExtractAppinfo(type_node);

    bool mixed = type_node.attribute("mixed").as_bool(false);

    // Direct compositor children (sequence, choice, all).
    for (auto child : type_node.children()) {
        std::string_view child_name = child.name();
        if (child_name == XsdName("sequence") || child_name == XsdName("choice") || child_name == XsdName("all")) {
            auto model = ProcessCompositor(child);
            if (mixed)
                model.model_type = "mixed";
            content_model_cache_[context_name] = std::move(model);
            break;
        }
    }

    // xs:complexContent (extension or restriction of another complex type).
    auto complex_content = type_node.child(XsdName("complexContent").c_str());
    if (complex_content) {
        if (auto ext = complex_content.child(XsdName("extension").c_str())) {
            type_info.base_type = StripPrefix(ext.attribute("base").as_string());
            EnsureTypeProcessed(type_info.base_type);
            ResolveExtension(ext, context_name);
        }
        if (auto restr = complex_content.child(XsdName("restriction").c_str())) {
            type_info.base_type = StripPrefix(restr.attribute("base").as_string());
            EnsureTypeProcessed(type_info.base_type);
            ResolveRestriction(restr, context_name);
        }
        if (mixed) {
            if (auto it = content_model_cache_.find(context_name); it != content_model_cache_.end()) {
                it->second.model_type = "mixed";
            }
        }
    }

    // xs:simpleContent (complex type with text content + attributes).
    auto simple_content = type_node.child(XsdName("simpleContent").c_str());
    if (simple_content) {
        ContentModelInfo model;
        model.model_type = "simple";
        content_model_cache_[context_name] = std::move(model);
        if (auto ext = simple_content.child(XsdName("extension").c_str())) {
            type_info.base_type = StripPrefix(ext.attribute("base").as_string());
            ExtractAttributes(ext, context_name);
        }
        if (auto restr = simple_content.child(XsdName("restriction").c_str())) {
            type_info.base_type = StripPrefix(restr.attribute("base").as_string());
            ExtractAttributes(restr, context_name);
        }
    }

    // Default to "empty" content model if nothing was set.
    if (!content_model_cache_.contains(context_name)) {
        ContentModelInfo model;
        model.model_type = "empty";
        content_model_cache_[context_name] = std::move(model);
    }

    ExtractAttributes(type_node, context_name);
    type_cache_[context_name] = std::move(type_info);
    processing_types_.erase(context_name);
}

// ============================================================================
// Extension / Restriction resolution
// ============================================================================

void SchemaParser::ResolveExtension(pugi::xml_node ext_node, const std::string& context_name) {
    std::string base = StripPrefix(ext_node.attribute("base").as_string());

    // Start with base type's content model.
    ContentModelInfo model;
    if (auto it = content_model_cache_.find(base); it != content_model_cache_.end()) {
        model = it->second;
    }

    // Inherit attributes from base type.
    if (auto it = attribute_cache_.find(base); it != attribute_cache_.end()) {
        attribute_cache_[context_name] = it->second;
    }

    // Append extension's own compositor children.
    for (auto child : ext_node.children()) {
        std::string_view child_name = child.name();
        if (child_name == XsdName("sequence") || child_name == XsdName("choice") || child_name == XsdName("all")) {
            auto ext_model = ProcessCompositor(child);
            if (model.model_type.empty() || model.model_type == "empty") {
                model = std::move(ext_model);
            } else {
                for (auto& elem : ext_model.elements)
                    model.elements.push_back(std::move(elem));
                for (auto& cg : ext_model.choice_groups)
                    model.choice_groups.push_back(std::move(cg));
                for (auto& cgo : ext_model.choice_groups_occurrences)
                    model.choice_groups_occurrences.push_back(cgo);
                for (auto& sg : ext_model.sequence_groups)
                    model.sequence_groups.push_back(std::move(sg));
            }
            break;
        }
    }

    content_model_cache_[context_name] = std::move(model);
    ExtractAttributes(ext_node, context_name);
}

void SchemaParser::ResolveRestriction(pugi::xml_node restr_node, const std::string& context_name) {
    for (auto child : restr_node.children()) {
        std::string_view child_name = child.name();
        if (child_name == XsdName("sequence") || child_name == XsdName("choice") || child_name == XsdName("all")) {
            content_model_cache_[context_name] = ProcessCompositor(child);
            break;
        }
    }
    ExtractAttributes(restr_node, context_name);
}

// ============================================================================
// Simple type processing
// ============================================================================

void SchemaParser::ProcessSimpleType(pugi::xml_node type_node, const std::string& context_name) {
    TypeInfo type_info;
    type_info.name = context_name;
    type_info.is_simple = true;
    type_info.documentation = ExtractDocumentation(type_node);
    type_info.appinfo = ExtractAppinfo(type_node);

    auto restriction = type_node.child(XsdName("restriction").c_str());
    if (restriction) {
        type_info.base_type = StripPrefix(restriction.attribute("base").as_string());

        // Enumerations.
        std::string enum_tag = XsdName("enumeration");
        for (auto node : restriction.children(enum_tag.c_str())) {
            type_info.enumerations.emplace_back(node.attribute("value").as_string());
        }

        // Facets.
        auto read_facet = [&](std::string_view facet_name) -> pugi::xml_node {
            return restriction.child(XsdName(facet_name).c_str());
        };
        if (auto n = read_facet("minInclusive")) {
            type_info.restrictions.min_inclusive = n.attribute("value").as_string();
        }
        if (auto n = read_facet("maxInclusive")) {
            type_info.restrictions.max_inclusive = n.attribute("value").as_string();
        }
        if (auto n = read_facet("minExclusive")) {
            type_info.restrictions.min_exclusive = n.attribute("value").as_string();
        }
        if (auto n = read_facet("maxExclusive")) {
            type_info.restrictions.max_exclusive = n.attribute("value").as_string();
        }
        if (auto n = read_facet("pattern")) {
            type_info.restrictions.pattern = n.attribute("value").as_string();
        }
        if (auto n = read_facet("minLength")) {
            int val = 0;
            auto sv = std::string_view(n.attribute("value").as_string());
            std::from_chars(sv.data(), sv.data() + sv.size(), val);
            type_info.restrictions.min_length = val;
        }
        if (auto n = read_facet("maxLength")) {
            int val = 0;
            auto sv = std::string_view(n.attribute("value").as_string());
            std::from_chars(sv.data(), sv.data() + sv.size(), val);
            type_info.restrictions.max_length = val;
        }
    }

    // xs:union â€” collect enumerations from inline and referenced member types.
    auto union_node = type_node.child(XsdName("union").c_str());
    if (union_node) {
        // Referenced member types via memberTypes attribute.
        std::string member_types_str = union_node.attribute("memberTypes").as_string();
        if (!member_types_str.empty()) {
            std::istringstream iss(member_types_str);
            std::string member_type;
            while (iss >> member_type) {
                std::string stripped = StripPrefix(member_type);
                EnsureTypeProcessed(stripped);
                type_info.member_types.push_back(stripped);
                if (auto it = type_cache_.find(stripped); it != type_cache_.end()) {
                    for (const auto& val : it->second.enumerations) {
                        type_info.enumerations.push_back(val);
                    }
                }
            }
        }
        // Inline member simple types.
        std::string simple_type_tag = XsdName("simpleType");
        std::string enum_tag2 = XsdName("enumeration");
        int inline_index = 0;
        for (auto child : union_node.children(simple_type_tag.c_str())) {
            std::string synthetic_name = context_name + ".union_member_" + std::to_string(inline_index);
            ProcessSimpleType(child, synthetic_name);
            type_info.member_types.push_back(synthetic_name);
            if (auto it = type_cache_.find(synthetic_name); it != type_cache_.end()) {
                for (const auto& val : it->second.enumerations) {
                    type_info.enumerations.push_back(val);
                }
            }
            ++inline_index;
        }
        type_info.base_type = "union";
    }

    // xs:list
    auto list_node = type_node.child(XsdName("list").c_str());
    if (list_node) {
        type_info.base_type = "list:" + StripPrefix(list_node.attribute("itemType").as_string());
    }

    type_cache_[context_name] = std::move(type_info);
}

// ============================================================================
// Attribute extraction
// ============================================================================

void SchemaParser::ExtractAttributes(pugi::xml_node parent, const std::string& context_name) {
    auto& attrs = attribute_cache_[context_name];
    std::string attr_tag = XsdName("attribute");
    for (auto attr_node : parent.children(attr_tag.c_str())) {
        AttributeInfo attr;
        attr.name = attr_node.attribute("name").as_string();
        if (attr.name.empty())
            continue;
        attr.type_name = StripPrefix(attr_node.attribute("type").as_string());
        attr.use = attr_node.attribute("use").as_string("optional");
        attr.required = (attr.use == "required");
        attr.default_value = attr_node.attribute("default").as_string();
        attr.fixed_value = attr_node.attribute("fixed").as_string();
        attr.documentation = ExtractDocumentation(attr_node);

        // Inline simple type on attribute (e.g. attribute with inline enumerations).
        auto inline_st = attr_node.child(XsdName("simpleType").c_str());
        if (inline_st) {
            std::string attr_type_name = context_name + "." + attr.name;
            ProcessSimpleType(inline_st, attr_type_name);
            attr.type_name = attr_type_name;
        }

        attrs[attr.name] = std::move(attr);
    }

    // xs:anyAttribute â€” wildcard attributes
    auto any_attr_node = parent.child(XsdName("anyAttribute").c_str());
    if (any_attr_node) {
        AttributeInfo wildcard;
        wildcard.name = "*";
        wildcard.type_name = "anyAttribute";
        wildcard.is_wildcard = true;
        wildcard.use = "optional";
        auto ns_attr = any_attr_node.attribute("namespace");
        if (ns_attr) {
            wildcard.namespace_constraint = ns_attr.value();
        }
        auto pc_attr = any_attr_node.attribute("processContents");
        if (pc_attr) {
            wildcard.process_contents = pc_attr.value();
        }
        wildcard.documentation = ExtractDocumentation(any_attr_node);
        attrs["*"] = std::move(wildcard);
    }
}

}  // namespace xve
