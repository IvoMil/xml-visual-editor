#include "xmlvisualeditor/services/document_service_impl.h"

namespace xve {

auto DocumentServiceImpl::OpenDocument(const std::filesystem::path& path) -> std::string {
    auto [doc, result] = Document::ParseFile(path);
    if (!doc)
        return "";

    auto id = GenerateId();
    documents_[id] = std::move(doc);
    return id;
}

auto DocumentServiceImpl::OpenDocumentFromString(std::string_view xml_content) -> std::string {
    auto [doc, result] = Document::ParseString(xml_content);
    auto id = GenerateId();
    documents_[id] = std::move(doc);
    return id;
}

auto DocumentServiceImpl::GetDocumentContent(const std::string& doc_id) -> std::optional<std::string> {
    auto it = documents_.find(doc_id);
    if (it == documents_.end())
        return std::nullopt;
    return it->second->ToString();
}

auto DocumentServiceImpl::UpdateDocumentContent(const std::string& doc_id, std::string_view xml_content) -> bool {
    auto [doc, result] = Document::ParseString(xml_content);
    if (!result.success)
        return false;

    documents_[doc_id] = std::move(doc);
    return true;
}

void DocumentServiceImpl::CloseDocument(const std::string& doc_id) {
    documents_.erase(doc_id);
}

auto DocumentServiceImpl::GetDocument(const std::string& doc_id) -> Document* {
    auto it = documents_.find(doc_id);
    if (it == documents_.end())
        return nullptr;
    return it->second.get();
}

std::string DocumentServiceImpl::GenerateId() {
    return "doc_" + std::to_string(next_id_++);
}

}  // namespace xve
