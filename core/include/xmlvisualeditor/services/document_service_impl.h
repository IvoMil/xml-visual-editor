#pragma once

#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/services/document_service.h"

#include <memory>
#include <string>
#include <unordered_map>

namespace xve {

class DocumentServiceImpl : public IDocumentService {
public:
    auto OpenDocument(const std::filesystem::path& path) -> std::string override;
    auto OpenDocumentFromString(std::string_view xml_content) -> std::string override;
    auto GetDocumentContent(const std::string& doc_id) -> std::optional<std::string> override;
    auto UpdateDocumentContent(const std::string& doc_id, std::string_view xml_content) -> bool override;
    void CloseDocument(const std::string& doc_id) override;
    auto GetDocument(const std::string& doc_id) -> Document* override;

private:
    std::string GenerateId();

    std::unordered_map<std::string, std::unique_ptr<Document>> documents_;
    int next_id_ = 1;
};

}  // namespace xve
