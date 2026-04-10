#include "xmlvisualeditor/core/document.h"

#include <cstring>
#include <fstream>
#include <sstream>

namespace xve {

// ── Element ────────────────────────────────────────────────────────────────────────────────────────

Element::Element(pugi::xml_node node) : node_(node) {}

Element::operator bool() const {
    return !node_.empty();
}

std::string Element::Name() const {
    return node_.name();
}

std::string Element::Text() const {
    return node_.text().as_string();
}

void Element::SetText(std::string_view text) {
    node_.text().set(std::string(text).c_str());
}

std::string Element::NamespaceUri() const {
    if (node_.empty())
        return "";

    std::string prefix = Prefix();
    std::string attr_name = prefix.empty() ? "xmlns" : "xmlns:" + prefix;

    for (auto current = node_; current; current = current.parent()) {
        auto attr = current.attribute(attr_name.c_str());
        if (attr)
            return attr.as_string();
    }
    return "";
}

std::string Element::Prefix() const {
    if (node_.empty())
        return "";
    std::string name = node_.name();
    auto pos = name.find(':');
    return (pos == std::string::npos) ? "" : name.substr(0, pos);
}

std::string Element::LocalName() const {
    if (node_.empty())
        return "";
    std::string name = node_.name();
    auto pos = name.find(':');
    return (pos == std::string::npos) ? name : name.substr(pos + 1);
}

std::string Element::QualifiedName() const {
    return Name();
}

std::string Element::GetAttribute(std::string_view name) const {
    return node_.attribute(std::string(name).c_str()).as_string();
}

void Element::SetAttribute(std::string_view name, std::string_view value) {
    std::string name_str(name);
    std::string value_str(value);
    auto attr = node_.attribute(name_str.c_str());
    if (attr) {
        attr.set_value(value_str.c_str());
    } else {
        node_.append_attribute(name_str.c_str()).set_value(value_str.c_str());
    }
}

void Element::RemoveAttribute(std::string_view name) {
    node_.remove_attribute(std::string(name).c_str());
}

bool Element::HasAttribute(std::string_view name) const {
    return !node_.attribute(std::string(name).c_str()).empty();
}

std::vector<std::pair<std::string, std::string>> Element::GetAttributes() const {
    std::vector<std::pair<std::string, std::string>> attrs;
    for (auto attr = node_.first_attribute(); attr; attr = attr.next_attribute()) {
        attrs.emplace_back(attr.name(), attr.value());
    }
    return attrs;
}

Element Element::Parent() const {
    return Element(node_.parent());
}

Element Element::FirstChild() const {
    for (auto child = node_.first_child(); child; child = child.next_sibling()) {
        if (child.type() == pugi::node_element)
            return Element(child);
    }
    return Element();
}

Element Element::NextSibling() const {
    for (auto sibling = node_.next_sibling(); sibling; sibling = sibling.next_sibling()) {
        if (sibling.type() == pugi::node_element)
            return Element(sibling);
    }
    return Element();
}

Element Element::PreviousSibling() const {
    for (auto sibling = node_.previous_sibling(); sibling; sibling = sibling.previous_sibling()) {
        if (sibling.type() == pugi::node_element)
            return Element(sibling);
    }
    return Element();
}

std::vector<Element> Element::Children() const {
    std::vector<Element> children;
    for (auto child = node_.first_child(); child; child = child.next_sibling()) {
        if (child.type() == pugi::node_element)
            children.emplace_back(child);
    }
    return children;
}

std::vector<Element> Element::ChildrenByName(std::string_view name) const {
    std::vector<Element> result;
    std::string name_str(name);
    for (auto child = node_.first_child(); child; child = child.next_sibling()) {
        if (child.type() == pugi::node_element && name_str == child.name()) {
            result.emplace_back(child);
        }
    }
    return result;
}

Element Element::AppendChild(std::string_view name) {
    return Element(node_.append_child(std::string(name).c_str()));
}

Element Element::InsertChildBefore(std::string_view name, const Element& ref) {
    return Element(node_.insert_child_before(std::string(name).c_str(), ref.PugiNode()));
}

Element Element::InsertChildAfter(std::string_view name, const Element& ref) {
    return Element(node_.insert_child_after(std::string(name).c_str(), ref.PugiNode()));
}

bool Element::RemoveChild(const Element& child) {
    return node_.remove_child(child.PugiNode());
}

std::string Element::GetPath() const {
    if (node_.empty())
        return "";

    std::vector<std::string> segments;
    for (auto current = node_; current && current.type() == pugi::node_element; current = current.parent()) {
        std::string segment = current.name();

        // Check if index is needed (multiple same-name siblings)
        auto parent = current.parent();
        if (parent) {
            int count = 0;
            for (auto child = parent.first_child(); child; child = child.next_sibling()) {
                if (child.type() == pugi::node_element && std::strcmp(child.name(), current.name()) == 0) {
                    if (++count > 1)
                        break;
                }
            }
            if (count > 1) {
                int index = 1;
                for (auto sib = current.previous_sibling(); sib; sib = sib.previous_sibling()) {
                    if (sib.type() == pugi::node_element && std::strcmp(sib.name(), current.name()) == 0) {
                        ++index;
                    }
                }
                segment += "[" + std::to_string(index) + "]";
            }
        }

        segments.push_back(std::move(segment));
    }

    std::string path;
    for (auto it = segments.rbegin(); it != segments.rend(); ++it) {
        path += "/" + *it;
    }
    return path.empty() ? "/" : path;
}

pugi::xml_node Element::PugiNode() const {
    return node_;
}

// ── Document ───────────────────────────────────────────────────────────────────────────────────────

Document::Document() = default;

auto Document::ParseString(std::string_view xml) -> std::pair<std::unique_ptr<Document>, ParseResult> {
    auto doc = std::make_unique<Document>();
    ParseResult result;

    pugi::xml_parse_result pugi_result = doc->doc_.load_buffer(
        xml.data(), xml.size(), pugi::parse_default | pugi::parse_declaration | pugi::parse_comments);

    result.success = static_cast<bool>(pugi_result);
    if (!pugi_result) {
        int line = 1;
        int column = 1;
        for (size_t i = 0; i < static_cast<size_t>(pugi_result.offset) && i < xml.size(); ++i) {
            if (xml[i] == '\n') {
                ++line;
                column = 1;
            } else {
                ++column;
            }
        }
        result.diagnostics.push_back({line, column, pugi_result.description(), "error"});
    }

    return {std::move(doc), result};
}

auto Document::ParseFile(const std::filesystem::path& path) -> std::pair<std::unique_ptr<Document>, ParseResult> {
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        ParseResult result;
        result.success = false;
        result.diagnostics.push_back({0, 0, "Failed to open file: " + path.string(), "error"});
        return {nullptr, result};
    }
    std::ostringstream oss;
    oss << file.rdbuf();
    return ParseString(oss.str());
}

auto Document::Create(std::string_view root_element_name) -> std::unique_ptr<Document> {
    auto doc = std::make_unique<Document>();
    auto decl = doc->doc_.prepend_child(pugi::node_declaration);
    decl.append_attribute("version") = "1.0";
    decl.append_attribute("encoding") = "UTF-8";
    doc->doc_.append_child(std::string(root_element_name).c_str());
    return doc;
}

Element Document::Root() const {
    return Element(doc_.document_element());
}

std::string Document::ToString(bool pretty_print, const std::string& indent, bool expand_empty) const {
    std::ostringstream oss;
    unsigned int flags = pretty_print ? pugi::format_indent : pugi::format_raw;
    if (expand_empty) {
        flags |= pugi::format_no_empty_element_tags;
    }
    doc_.save(oss, pretty_print ? indent.c_str() : "", flags);
    return oss.str();
}

bool Document::SaveToFile(const std::filesystem::path& path, bool pretty_print) const {
    unsigned int flags = pretty_print ? pugi::format_indent : pugi::format_raw;
    return doc_.save_file(path.string().c_str(), pretty_print ? "    " : "", flags);
}

std::string Document::Version() const {
    for (auto node = doc_.first_child(); node; node = node.next_sibling()) {
        if (node.type() == pugi::node_declaration) {
            return node.attribute("version").as_string("1.0");
        }
    }
    return "1.0";
}

std::string Document::Encoding() const {
    for (auto node = doc_.first_child(); node; node = node.next_sibling()) {
        if (node.type() == pugi::node_declaration) {
            return node.attribute("encoding").as_string("UTF-8");
        }
    }
    return "UTF-8";
}

std::optional<std::string> Document::DetectSchemaUrl() const {
    auto root = Root();
    if (!root)
        return std::nullopt;

    std::string no_ns = root.GetAttribute("xsi:noNamespaceSchemaLocation");
    if (!no_ns.empty())
        return no_ns;

    std::string schema_loc = root.GetAttribute("xsi:schemaLocation");
    if (!schema_loc.empty())
        return schema_loc;

    return std::nullopt;
}

}  // namespace xve
