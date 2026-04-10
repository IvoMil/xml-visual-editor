#pragma once

#include "xmlvisualeditor/services/validation_service.h"

namespace xve {

class IDocumentService;
class ISchemaService;

class ValidationServiceImpl : public IValidationService {
public:
    ValidationServiceImpl(IDocumentService* document_service, ISchemaService* schema_service);

    auto ValidateWellFormedness(std::string_view xml_content) -> std::vector<Diagnostic> override;
    auto ValidateDocument(const std::string& doc_id) -> std::vector<Diagnostic> override;
    auto ValidateAgainstSchema(std::string_view xml_content, const std::string& schema_id)
        -> std::vector<Diagnostic> override;

private:
    IDocumentService* document_service_;
    ISchemaService* schema_service_;
};

}  // namespace xve
