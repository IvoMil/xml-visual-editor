#pragma once

#include <pugixml.hpp>

#include <filesystem>
#include <memory>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace xve {

// Diagnostic represents a parsing/validation error.
struct Diagnostic {
    int line = 0;
    int column = 0;
    std::string message;
    std::string severity = "error";  // "error", "warning", "info"
    std::string element_path;        // XPath-like path to element with the issue
};

// ParseResult holds the result of parsing XML.
struct ParseResult {
    bool success = false;
    std::vector<Diagnostic> diagnostics;
};

// Element is a lightweight handle wrapping pugixml's xml_node.
// It does NOT own the node — the Document owns the tree.
class Element {
public:
    Element() = default;
    explicit Element(pugi::xml_node node);

    explicit operator bool() const;

    // Properties
    std::string Name() const;
    std::string Text() const;
    void SetText(std::string_view text);

    // Namespace support
    std::string NamespaceUri() const;
    std::string Prefix() const;
    std::string LocalName() const;
    std::string QualifiedName() const;

    // Attributes
    std::string GetAttribute(std::string_view name) const;
    void SetAttribute(std::string_view name, std::string_view value);
    void RemoveAttribute(std::string_view name);
    bool HasAttribute(std::string_view name) const;
    std::vector<std::pair<std::string, std::string>> GetAttributes() const;

    // Navigation
    Element Parent() const;
    Element FirstChild() const;
    Element NextSibling() const;
    Element PreviousSibling() const;
    std::vector<Element> Children() const;
    std::vector<Element> ChildrenByName(std::string_view name) const;

    // Mutation
    Element AppendChild(std::string_view name);
    Element InsertChildBefore(std::string_view name, const Element& ref);
    Element InsertChildAfter(std::string_view name, const Element& ref);
    bool RemoveChild(const Element& child);

    // Path (returns XPath-like path e.g. "/root/child[2]/grandchild")
    std::string GetPath() const;

    // Internal: access underlying pugixml node (for use within core only)
    pugi::xml_node PugiNode() const;

private:
    pugi::xml_node node_;
};

// Document owns the pugixml document tree.
class Document {
public:
    Document();
    ~Document() = default;
    Document(Document&&) noexcept = default;
    Document& operator=(Document&&) noexcept = default;
    Document(const Document&) = delete;
    Document& operator=(const Document&) = delete;

    // Parse XML from string
    static auto ParseString(std::string_view xml) -> std::pair<std::unique_ptr<Document>, ParseResult>;

    // Parse XML from file
    static auto ParseFile(const std::filesystem::path& path) -> std::pair<std::unique_ptr<Document>, ParseResult>;

    // Create a new empty document with a root element
    static auto Create(std::string_view root_element_name) -> std::unique_ptr<Document>;

    // Root element
    Element Root() const;

    // Serialization
    std::string ToString(bool pretty_print = true, const std::string& indent = "    ", bool expand_empty = false) const;
    bool SaveToFile(const std::filesystem::path& path, bool pretty_print = true) const;

    // Document info
    std::string Version() const;
    std::string Encoding() const;

    // Schema URL detection (looks for xsi:schemaLocation or xsi:noNamespaceSchemaLocation)
    std::optional<std::string> DetectSchemaUrl() const;

private:
    pugi::xml_document doc_;
};

}  // namespace xve
