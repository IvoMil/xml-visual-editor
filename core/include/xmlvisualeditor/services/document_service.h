#pragma once

#include <filesystem>
#include <optional>
#include <string>
#include <string_view>

namespace xve {

class Document;

class IDocumentService {
public:
    virtual ~IDocumentService() = default;

    virtual auto OpenDocument(const std::filesystem::path& path) -> std::string = 0;
    virtual auto OpenDocumentFromString(std::string_view xml_content) -> std::string = 0;
    virtual auto GetDocumentContent(const std::string& doc_id) -> std::optional<std::string> = 0;
    virtual auto UpdateDocumentContent(const std::string& doc_id, std::string_view xml_content) -> bool = 0;
    virtual void CloseDocument(const std::string& doc_id) = 0;
    virtual auto GetDocument(const std::string& doc_id) -> Document* = 0;
};

}  // namespace xve
