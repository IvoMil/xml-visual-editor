#include "xmlvisualeditor/core/document.h"
#include "xmlvisualeditor/schema/schema_validator.h"
#include "xmlvisualeditor/services/document_service.h"
#include "xmlvisualeditor/services/schema_service.h"
#include "xmlvisualeditor/services/validation_service_impl.h"

namespace xve {

ValidationServiceImpl::ValidationServiceImpl(IDocumentService* document_service, ISchemaService* schema_service)
    : document_service_(document_service), schema_service_(schema_service) {}

auto ValidationServiceImpl::ValidateWellFormedness(std::string_view xml_content) -> std::vector<Diagnostic> {
    auto [doc, result] = Document::ParseString(xml_content);
    return std::move(result.diagnostics);
}

auto ValidationServiceImpl::ValidateDocument(const std::string& doc_id) -> std::vector<Diagnostic> {
    if (!document_service_) {
        return {{0, 0, "Document service not available", "error"}};
    }

    auto content = document_service_->GetDocumentContent(doc_id);
    if (!content) {
        return {{0, 0, "Document not found: " + doc_id, "error"}};
    }

    return ValidateWellFormedness(*content);
}

auto ValidationServiceImpl::ValidateAgainstSchema(std::string_view xml_content, const std::string& schema_id)
    -> std::vector<Diagnostic> {
    auto well_formedness = ValidateWellFormedness(xml_content);
    if (!well_formedness.empty()) {
        return well_formedness;
    }

    if (!schema_service_ || !schema_service_->IsSchemaLoaded(schema_id)) {
        return {{0, 0, "Schema not loaded: " + schema_id, "info"}};
    }

    return SchemaValidator::Validate(xml_content, *schema_service_, schema_id);
}

}  // namespace xve
