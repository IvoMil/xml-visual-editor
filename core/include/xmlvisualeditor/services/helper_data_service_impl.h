#pragma once

#include "xmlvisualeditor/services/helper_data_service.h"

namespace xve {

class IDocumentService;
class ISchemaService;

class HelperDataServiceImpl : public IHelperDataService {
public:
    HelperDataServiceImpl(IDocumentService* document_service, ISchemaService* schema_service);

    auto ComputeElementsPanelData(const std::string& schema_id,
                                  const std::string& element_name,
                                  const std::vector<std::string>& element_path,
                                  const std::string& doc_id) -> std::optional<ElementsPanelData> override;

    auto ComputeAttributesPanelData(const std::string& schema_id,
                                    const std::string& element_name,
                                    const std::vector<std::string>& element_path,
                                    const std::string& doc_id) -> std::optional<AttributesPanelData> override;

    auto ComputeNodeDetails(const std::string& schema_id,
                            const std::string& element_name,
                            const std::vector<std::string>& element_path,
                            const std::string& doc_id) -> std::optional<NodeDetails> override;

    auto InsertElement(const std::string& doc_id,
                       const std::string& schema_id,
                       const std::vector<std::string>& parent_path,
                       const std::string& element_name,
                       int cursor_line = -1) -> InsertElementResult override;

    auto InsertRequiredChildren(const std::string& doc_id,
                                const std::string& schema_id,
                                const std::vector<std::string>& element_path) -> InsertRequiredResult override;

private:
    IDocumentService* document_service_;
    ISchemaService* schema_service_;
};

}  // namespace xve
