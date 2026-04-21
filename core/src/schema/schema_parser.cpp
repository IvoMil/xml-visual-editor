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
// Utilities
// ============================================================================

auto SchemaParser::FindXsdPrefix(pugi::xml_node schema_node) -> std::string {
    for (auto attr : schema_node.attributes()) {
        std::string_view attr_name = attr.name();
        if (attr_name.starts_with("xmlns:") && std::string_view(attr.value()) == "http://www.w3.org/2001/XMLSchema") {
            return std::string(attr_name.substr(6));
        }
        // Default namespace is XSD namespace (no prefix)
        if (attr_name == "xmlns" && std::string_view(attr.value()) == "http://www.w3.org/2001/XMLSchema") {
            return {};
        }
    }
    return "xs";
}

auto SchemaParser::XsdName(std::string_view local_name) const -> std::string {
    if (xsd_prefix_.empty()) {
        return std::string(local_name);
    }
    std::string result;
    result.reserve(xsd_prefix_.size() + 1 + local_name.size());
    result += xsd_prefix_;
    result += ':';
    result += local_name;
    return result;
}

auto SchemaParser::StripPrefix(std::string_view qualified_name) const -> std::string {
    if (qualified_name.empty())
        return {};
    auto colon = qualified_name.find(':');
    if (colon != std::string_view::npos) {
        return std::string(qualified_name.substr(colon + 1));
    }
    return std::string(qualified_name);
}

auto SchemaParser::ExtractDocumentation(pugi::xml_node node) const -> std::string {
    auto annotation = node.child(XsdName("annotation").c_str());
    if (!annotation)
        return {};
    auto documentation = annotation.child(XsdName("documentation").c_str());
    if (!documentation)
        return {};
    return documentation.text().as_string();
}

auto SchemaParser::ExtractAppinfo(pugi::xml_node node) const -> std::string {
    auto annotation = node.child(XsdName("annotation").c_str());
    if (!annotation)
        return {};
    auto appinfo = annotation.child(XsdName("appinfo").c_str());
    if (!appinfo)
        return {};
    return appinfo.text().as_string();
}

// ============================================================================
// Static factory methods
// ============================================================================

auto SchemaParser::ParseString(std::string_view xsd_content) -> std::expected<SchemaParser, std::string> {
    SchemaParser parser;
    parser.doc_ = std::make_unique<pugi::xml_document>();
    auto result = parser.doc_->load_buffer(xsd_content.data(), xsd_content.size());
    if (!result) {
        return std::unexpected(std::string("Failed to parse XSD: ") + result.description());
    }
    auto schema_node = parser.doc_->first_child();
    if (!schema_node) {
        return std::unexpected(std::string("XSD document has no root element"));
    }
    parser.xsd_prefix_ = FindXsdPrefix(schema_node);
    parser.target_namespace_ = schema_node.attribute("targetNamespace").as_string();
    parser.ParseSchema(schema_node);
    return parser;
}

auto SchemaParser::ParseFile(const std::filesystem::path& path) -> std::expected<SchemaParser, std::string> {
    SchemaParser parser;
    parser.doc_ = std::make_unique<pugi::xml_document>();
    auto result = parser.doc_->load_file(path.string().c_str());
    if (!result) {
        return std::unexpected(std::string("Failed to load XSD file '") + path.string() + "': " + result.description());
    }
    auto schema_node = parser.doc_->first_child();
    if (!schema_node) {
        return std::unexpected(std::string("XSD document has no root element"));
    }
    parser.xsd_prefix_ = FindXsdPrefix(schema_node);
    parser.target_namespace_ = schema_node.attribute("targetNamespace").as_string();
    parser.base_dir_ = path.parent_path();
    parser.ParseSchema(schema_node);
    return parser;
}

// ============================================================================
// Schema traversal
// ============================================================================

void SchemaParser::ParseSchema(pugi::xml_node schema_node) {
    // Stage 1: Process xs:include directives — merge definitions from included schemas.
    if (!base_dir_.empty()) {
        for (auto child : schema_node.children()) {
            std::string_view child_name = child.name();
            if (child_name != XsdName("include"))
                continue;
            std::string schema_location = child.attribute("schemaLocation").as_string();
            if (schema_location.empty())
                continue;
            auto include_path = base_dir_ / schema_location;
            auto inc_doc = std::make_unique<pugi::xml_document>();
            auto load_result = inc_doc->load_file(include_path.string().c_str());
            if (!load_result)
                continue;
            auto inc_schema = inc_doc->first_child();
            if (!inc_schema)
                continue;
            std::string inc_prefix = FindXsdPrefix(inc_schema);
            auto inc_xsd_name = [&inc_prefix](std::string_view local) -> std::string {
                if (inc_prefix.empty())
                    return std::string(local);
                std::string r;
                r.reserve(inc_prefix.size() + 1 + local.size());
                r += inc_prefix;
                r += ':';
                r += local;
                return r;
            };
            for (auto inc_child : inc_schema.children()) {
                std::string name = inc_child.attribute("name").as_string();
                if (name.empty())
                    continue;
                std::string_view inc_child_name = inc_child.name();
                if (inc_child_name == inc_xsd_name("complexType") || inc_child_name == inc_xsd_name("simpleType")) {
                    type_nodes_[name] = inc_child;
                } else if (inc_child_name == inc_xsd_name("element")) {
                    element_nodes_[name] = inc_child;
                    root_elements_.push_back(name);
                } else if (inc_child_name == inc_xsd_name("group")) {
                    group_nodes_[name] = inc_child;
                }
            }
            included_docs_.push_back(std::move(inc_doc));
        }
    }

    // Stage 2: Index all named types and global elements by name (no processing yet).
    for (auto child : schema_node.children()) {
        std::string name = child.attribute("name").as_string();
        if (name.empty())
            continue;
        std::string_view child_name = child.name();
        if (child_name == XsdName("complexType") || child_name == XsdName("simpleType")) {
            type_nodes_[name] = child;
        } else if (child_name == XsdName("element")) {
            element_nodes_[name] = child;
            root_elements_.push_back(name);
        } else if (child_name == XsdName("group")) {
            group_nodes_[name] = child;
        }
    }

    // Stage 3: Process all global elements (types are resolved on demand).
    for (const auto& name : root_elements_) {
        EnsureElementProcessed(name);
    }
}

void SchemaParser::EnsureTypeProcessed(const std::string& type_name) {
    if (type_cache_.contains(type_name))
        return;
    auto it = type_nodes_.find(type_name);
    if (it == type_nodes_.end())
        return;
    auto node = it->second;
    if (std::string_view(node.name()) == XsdName("complexType")) {
        ProcessComplexType(node, type_name);
    } else {
        ProcessSimpleType(node, type_name);
    }
}

void SchemaParser::EnsureElementProcessed(const std::string& element_name) {
    if (element_cache_.contains(element_name))
        return;
    auto it = element_nodes_.find(element_name);
    if (it == element_nodes_.end())
        return;
    auto elem = ProcessElement(it->second);
    element_cache_[element_name] = std::move(elem);
}

// ============================================================================
// Element processing
// ============================================================================

auto SchemaParser::ProcessElement(pugi::xml_node elem_node) -> ElementInfo {
    ElementInfo info;

    // Handle ref attribute (e.g. <xs:element ref="otherElement"/>).
    auto ref_attr = elem_node.attribute("ref");
    if (ref_attr) {
        std::string ref_name = StripPrefix(ref_attr.as_string());
        EnsureElementProcessed(ref_name);
        if (auto cache_it = element_cache_.find(ref_name); cache_it != element_cache_.end()) {
            info = cache_it->second;
        } else {
            info.name = ref_name;
        }
        info.min_occurs = ParseOccurs(elem_node.attribute("minOccurs"), info.min_occurs);
        info.max_occurs = ParseOccurs(elem_node.attribute("maxOccurs"), info.max_occurs);
        return info;
    }

    info.name = elem_node.attribute("name").as_string();
    info.min_occurs = ParseOccurs(elem_node.attribute("minOccurs"), 1);
    info.max_occurs = ParseOccurs(elem_node.attribute("maxOccurs"), 1);
    info.nillable = elem_node.attribute("nillable").as_bool(false);
    info.is_abstract = elem_node.attribute("abstract").as_bool(false);
    info.substitution_group = StripPrefix(elem_node.attribute("substitutionGroup").as_string());
    info.default_value = elem_node.attribute("default").as_string();
    info.fixed_value = elem_node.attribute("fixed").as_string();
    info.documentation = ExtractDocumentation(elem_node);
    info.appinfo = ExtractAppinfo(elem_node);

    // Resolve referenced type name.
    auto type_attr = elem_node.attribute("type");
    if (type_attr) {
        info.type_name = StripPrefix(type_attr.as_string());
        EnsureTypeProcessed(info.type_name);
    }

    // Inline complex type definition.
    auto inline_ct = elem_node.child(XsdName("complexType").c_str());
    if (inline_ct) {
        ProcessComplexType(inline_ct, info.name);
        if (info.type_name.empty())
            info.type_name = info.name;
    }

    // Inline simple type definition.
    auto inline_st = elem_node.child(XsdName("simpleType").c_str());
    if (inline_st) {
        ProcessSimpleType(inline_st, info.name);
        if (info.type_name.empty())
            info.type_name = info.name;
    }

    // Cache the element info so GetElementInfo() can find child elements.
    if (!info.name.empty() && !element_cache_.contains(info.name)) {
        element_cache_[info.name] = info;
    }

    return info;
}

}  // namespace xve
